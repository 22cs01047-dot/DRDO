# session_controller.py
"""
Session Controller

Manages the lifecycle of a verification session and
orchestrates the full processing pipeline.

CHANGES:
- Integrated SpeakerTurnDetector for content-based speaker turn
  detection (replaces pure gap-based approach).
- Wired RuleLoader (was orphaned — now available for rule queries).
- Uses asyncio.to_thread() for blocking calls.
"""

import asyncio
import logging
import time
import uuid
from datetime import datetime
from typing import Optional, Callable, List

from checklist.config_loader import ChecklistConfig, load_checklist_config
from checklist.state_manager import ChecklistStateManager, ItemStatus
from checklist.matcher import ChecklistMatcher, ChecklistMatchResult
from checklist.progress_tracker import ProgressTracker, ProgressReport
from nlp_engine.semantic_matcher import SemanticMatcher
from nlp_engine.intent_classifier import IntentClassifier
from nlp_engine.keyword_extractor import KeywordExtractor
from nlp_engine.context_manager import ConversationContextManager
from stt_engine.whisper_model import WhisperSTT
from stt_engine.transcriber import Transcriber, TranscriptionSegment
from stt_engine.post_processor import PostProcessor
from audio_capture.audio_stream import AudioStream, AudioSegment
from audio_capture.vad_processor import VADProcessor
from audio_capture.audio_segmenter import AudioSegmenter
from audio_capture.speaker_detector import SpeakerTurnDetector
from rules_engine.dependency_validator import DependencyValidator
from rules_engine.order_validator import OrderValidator
from rules_engine.alert_generator import AlertGenerator, AlertSeverity
from rules_engine.rule_loader import RuleLoader
from session.session_logger import SessionLogger

logger = logging.getLogger(__name__)


class SessionController:
    """
    Master controller for a verification session.

    Orchestrates:
    - Audio capture → VAD → Segmentation
    - STT transcription
    - Content-based speaker turn detection (post-transcription)
    - NLP matching
    - Rules validation
    - State management
    - Alert generation
    - Progress tracking
    - WebSocket broadcast to UI via callbacks
    """

    def __init__(self, system_config: dict):
        self.system_config = system_config
        self.session_id: Optional[str] = None
        self.is_active = False
        self.is_paused = False

        # Components (initialized in setup)
        self.config: Optional[ChecklistConfig] = None
        self.state_manager: Optional[ChecklistStateManager] = None
        self.progress_tracker: Optional[ProgressTracker] = None
        self.alert_generator: Optional[AlertGenerator] = None
        self.dependency_validator: Optional[DependencyValidator] = None
        self.order_validator: Optional[OrderValidator] = None
        self.rule_loader: Optional[RuleLoader] = None
        self.context_manager: Optional[ConversationContextManager] = None
        self.checklist_matcher: Optional[ChecklistMatcher] = None
        self.transcriber: Optional[Transcriber] = None
        self.audio_segmenter: Optional[AudioSegmenter] = None
        self.session_logger: Optional[SessionLogger] = None

        # CHANGE: Content-based speaker turn detector
        self.speaker_detector: Optional[SpeakerTurnDetector] = None

        # Callbacks for UI updates (async callables)
        self._on_transcription: Optional[Callable] = None
        self._on_checklist_update: Optional[Callable] = None
        self._on_alert: Optional[Callable] = None
        self._on_progress: Optional[Callable] = None

        # Reference to the running event loop (set during start_session)
        self._loop: Optional[asyncio.AbstractEventLoop] = None

        # Inactivity tracking
        self._last_activity_time: float = 0
        self._inactivity_timeout = system_config.get("rules", {}).get(
            "inactivity_timeout", 120
        )

    def set_callbacks(
        self,
        on_transcription: Callable = None,
        on_checklist_update: Callable = None,
        on_alert: Callable = None,
        on_progress: Callable = None,
    ):
        """Set UI update callbacks (async functions that broadcast over WebSocket)."""
        self._on_transcription = on_transcription
        self._on_checklist_update = on_checklist_update
        self._on_alert = on_alert
        self._on_progress = on_progress

    # ── Safe callback invocation ────────────────────────────

    async def _fire_callback(self, callback: Optional[Callable], *args) -> None:
        """Safely invoke an async callback."""
        if callback is None:
            return
        try:
            await callback(*args)
        except Exception as e:
            logger.error(f"Callback error ({callback.__name__}): {e}", exc_info=True)

    def _fire_callback_threadsafe(self, callback: Optional[Callable], *args) -> None:
        """Schedule an async callback from a synchronous context."""
        if callback is None or self._loop is None:
            return
        try:
            asyncio.run_coroutine_threadsafe(
                self._fire_callback(callback, *args),
                self._loop,
            )
        except Exception as e:
            logger.error(f"Threadsafe callback error: {e}", exc_info=True)

    # ── Setup ───────────────────────────────────────────────

    async def setup(
        self,
        checklist_config_path: str,
        stt_model: WhisperSTT,
        semantic_matcher: SemanticMatcher,
        vocabulary_path: Optional[str] = None,
    ) -> None:
        """
        Initialize all components for a session.

        Args:
            checklist_config_path: Path to checklist YAML.
            stt_model: Pre-loaded Whisper model.
            semantic_matcher: Pre-loaded semantic matcher.
            vocabulary_path: Path to vocabulary YAML.
        """
        logger.info("Setting up session components...")

        # Load checklist config
        self.config = load_checklist_config(checklist_config_path)

        # Register checklist items with semantic matcher
        semantic_matcher.register_checklist_items(self.config.raw_config)

        # State manager
        self.state_manager = ChecklistStateManager(self.config)

        # Progress tracker
        self.progress_tracker = ProgressTracker(
            self.config, self.state_manager
        )

        # Alert generator
        self.alert_generator = AlertGenerator()

        # Wire alert callback using threadsafe bridge
        def _alert_callback(alert):
            self._fire_callback_threadsafe(self._on_alert, alert)

        self.alert_generator.add_callback(_alert_callback)

        # Validators
        self.dependency_validator = DependencyValidator(self.config.raw_config)
        self.order_validator = OrderValidator(self.config, self.state_manager)

        # CHANGE: Wire RuleLoader (was orphaned — now available for
        # rule queries like is_rule_enabled, get_rules_by_type, etc.)
        self.rule_loader = RuleLoader(self.config)
        logger.info(
            f"RuleLoader initialized: {len(self.rule_loader.get_all_rules())} rules, "
            f"types: {self.rule_loader.rule_types}"
        )

        # NLP components
        keyword_extractor = KeywordExtractor(use_spacy=False)
        intent_classifier = IntentClassifier(
            semantic_matcher=semantic_matcher
        )
        self.context_manager = ConversationContextManager()

        # Checklist matcher
        self.checklist_matcher = ChecklistMatcher(
            checklist_config=self.config,
            semantic_matcher=semantic_matcher,
            intent_classifier=intent_classifier,
            keyword_extractor=keyword_extractor,
            context_manager=self.context_manager,
            confidence_threshold=self.system_config.get("nlp", {}).get(
                "confidence_threshold", 0.65
            ),
        )

        # Transcriber
        post_processor = PostProcessor(vocabulary_path=vocabulary_path)
        self.transcriber = Transcriber(
            stt_model=stt_model,
            post_processor=post_processor,
        )

        # ── CHANGE: Content-based speaker turn detector ──────
        # Reads questioner callsigns from system_config.yaml:
        #   half_duplex:
        #     questioner_callsigns: ["programmer", "controller"]
        #     turn_gap_threshold_s: 2.0
        half_duplex_config = self.system_config.get("half_duplex", {})
        self.speaker_detector = SpeakerTurnDetector(
            questioner_callsigns=half_duplex_config.get(
                "questioner_callsigns",
                SpeakerTurnDetector.DEFAULT_CALLSIGNS,
            ),
            turn_gap_threshold=half_duplex_config.get(
                "turn_gap_threshold_s", 2.0
            ),
        )

        # Audio pipeline
        audio_config = self.system_config.get("audio", {})
        vad_config = self.system_config.get("vad", {})
        paths_config = self.system_config.get("paths", {})

        audio_stream = AudioStream(
            sample_rate=audio_config.get("sample_rate", 16000),
            channels=audio_config.get("channels", 1),
            chunk_size=audio_config.get("chunk_size", 1024),
            device_index=audio_config.get("device_index"),
            recording_dir=paths_config.get("audio_recordings_dir"),
            recording_enabled=audio_config.get("recording_enabled", True),
        )

        vad_processor = VADProcessor(
            threshold=vad_config.get("threshold", 0.5),
            min_speech_duration_ms=vad_config.get(
                "min_speech_duration_ms", 250
            ),
            min_silence_duration_ms=vad_config.get(
                "min_silence_duration_ms", 600
            ),
            sample_rate=audio_config.get("sample_rate", 16000),
        )
        vad_processor.load_model()

        self.audio_segmenter = AudioSegmenter(
            audio_stream=audio_stream,
            vad_processor=vad_processor,
            output_dir=paths_config.get("audio_recordings_dir"),
            turn_gap_threshold=half_duplex_config.get(
                "turn_gap_threshold_s", 2.0
            ),
        )

        # Session logger
        self.session_logger = SessionLogger(
            log_dir=paths_config.get("sessions_dir", "../data/sessions")
        )

        logger.info("Session setup complete.")

    # ── Session Lifecycle ───────────────────────────────────

    async def start_session(self) -> str:
        """Start a new verification session. Returns Session ID."""
        self.session_id = (
            f"SESSION_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            f"_{uuid.uuid4().hex[:6]}"
        )
        self.is_active = True
        self.is_paused = False
        self._last_activity_time = time.time()

        # Capture the running event loop for threadsafe callback bridging
        self._loop = asyncio.get_running_loop()

        # Reset state
        self.state_manager.reset()
        self.context_manager.reset()
        self.alert_generator.clear()
        self.speaker_detector.reset()

        # Start session logger
        self.session_logger.start_session(
            self.session_id, self.config.mission_name
        )

        # Start audio pipeline
        self.audio_segmenter.start(session_id=self.session_id)

        # Start processing loop and inactivity monitor as background tasks
        asyncio.create_task(self._processing_loop())
        asyncio.create_task(self._inactivity_monitor())

        self.alert_generator.generate_info(
            "SESSION_START",
            f"Session '{self.session_id}' started for mission "
            f"'{self.config.mission_name}'",
        )

        logger.info(f"Session started: {self.session_id}")
        return self.session_id

    async def stop_session(self) -> dict:
        """Stop the current session and generate report."""
        if not self.is_active:
            return {}

        self.is_active = False
        self.is_paused = False

        # Stop audio
        self.audio_segmenter.stop()

        # Final progress
        progress = self.progress_tracker.get_progress()

        # Log speaker detection stats
        if self.speaker_detector:
            stats = self.speaker_detector.stats
            logger.info(
                f"Speaker detection stats: "
                f"{stats['questions']} questions, "
                f"{stats['responses']} responses, "
                f"{stats['total_turns']} total turns"
            )

        # End session logger
        self.session_logger.end_session(
            progress=progress.__dict__,
            alerts=self.alert_generator.to_list(),
        )

        self.alert_generator.generate_info(
            "SESSION_END",
            f"Session '{self.session_id}' ended. "
            f"Progress: {progress.overall_progress:.1f}%",
        )

        logger.info(
            f"Session ended: {self.session_id} — "
            f"Progress: {progress.overall_progress:.1f}%"
        )

        return {
            "session_id": self.session_id,
            "progress": progress.__dict__,
            "state": self.state_manager.get_snapshot(),
            "alerts": self.alert_generator.to_list(),
        }

    async def pause_session(self) -> dict:
        """Pause the current session."""
        if not self.is_active or self.is_paused:
            return {}

        self.is_paused = True
        self.audio_segmenter.pause()

        self.alert_generator.generate_info(
            "SESSION_PAUSE",
            f"Session '{self.session_id}' paused.",
        )

        logger.info(f"Session paused: {self.session_id}")
        return {
            "session_id": self.session_id,
            "status": "PAUSED",
        }

    async def resume_session(self) -> dict:
        """Resume a paused session."""
        if not self.is_active or not self.is_paused:
            return {}

        self.is_paused = False
        self._last_activity_time = time.time()
        self.audio_segmenter.resume()

        self.alert_generator.generate_info(
            "SESSION_RESUME",
            f"Session '{self.session_id}' resumed.",
        )

        logger.info(f"Session resumed: {self.session_id}")
        return {
            "session_id": self.session_id,
            "status": "ACTIVE",
        }

    # ── Processing Loop ─────────────────────────────────────

    async def _processing_loop(self) -> None:
        """
        Main processing loop: read segments → transcribe →
        detect speaker → match → update.

        CHANGE: Added SpeakerTurnDetector step between
        transcription and matching.
        """
        logger.info("Processing loop started.")

        while self.is_active:
            try:
                if self.is_paused:
                    await asyncio.sleep(0.25)
                    continue

                # Offload blocking queue read to thread pool
                segment = await asyncio.to_thread(
                    self.audio_segmenter.get_segment, timeout=0.5
                )

                if segment is None:
                    await asyncio.sleep(0.05)
                    continue

                self._last_activity_time = time.time()

                # Offload blocking transcription to thread pool
                transcription = await asyncio.to_thread(
                    self.transcriber.transcribe_segment, segment
                )

                if transcription is None:
                    continue

                # ──────────────────────────────────────────────
                # CHANGE: Content-based speaker turn detection.
                #
                # The AudioSegmenter sets a preliminary "UNKNOWN"
                # speaker_turn. Now we override it using the actual
                # transcribed text.
                #
                # Pattern: "Programmer to <target>" → QUESTIONER
                # Everything else after a question  → RESPONDER
                # ──────────────────────────────────────────────
                detected_turn = self.speaker_detector.detect(
                    text=transcription.processed_text,
                    segment_start=segment.timestamp_start.timestamp(),
                    segment_end=segment.timestamp_end.timestamp(),
                )
                transcription.speaker_turn = detected_turn

                logger.info(
                    f"[TURN] {detected_turn} ← "
                    f"'{transcription.processed_text[:60]}'"
                )

                # Log transcription (with corrected speaker_turn)
                self.session_logger.log_transcription(transcription)

                # Notify UI
                await self._fire_callback(self._on_transcription, transcription)

                # Offload blocking NLP matching to thread pool
                match_result = await asyncio.to_thread(
                    self.checklist_matcher.match, transcription
                )

                # Process match result
                await self._process_match(match_result)

            except asyncio.CancelledError:
                logger.info("Processing loop cancelled.")
                break
            except Exception as e:
                logger.error(f"Processing loop error: {e}", exc_info=True)
                await asyncio.sleep(1.0)

        logger.info("Processing loop ended.")

    async def _process_match(
        self, match: ChecklistMatchResult
    ) -> None:
        """Process a checklist match result."""
        if match.intent == "NO_MATCH":
            return

        if match.checklist_item_id is None:
            return

        item_id = match.checklist_item_id
        stage_id = match.stage_id

        # Determine item status from intent
        if match.intent == "CONFIRMED":
            new_status = ItemStatus.CONFIRMED
        elif match.intent == "FAILED":
            new_status = ItemStatus.FAILED
        elif match.intent == "QUESTION":
            new_status = ItemStatus.IN_PROGRESS
        else:
            new_status = ItemStatus.AMBIGUOUS

        # Validate order (sync, fast)
        if stage_id:
            order_violations = self.order_validator.validate_item_order(
                stage_id, item_id
            )
            for v in order_violations:
                self.alert_generator.generate_warning(
                    v.rule_id,
                    v.message,
                    stage_id=v.stage_id,
                    item_id=v.item_id,
                )

        # Validate dependencies (sync, fast)
        if stage_id:
            stage_states = {
                s.stage_id: {"status": s.status.value}
                for s in self.state_manager.get_all_stages()
            }
            dep_alerts = self.dependency_validator.validate_stage_transition(
                stage_id, stage_states
            )
            for da in dep_alerts:
                self.alert_generator.generate(
                    AlertSeverity[da.severity.value],
                    da.rule_id,
                    da.message,
                    stage_id=da.stage_id,
                )

        # Update state (sync, fast)
        self.state_manager.update_item(
            item_id=item_id,
            status=new_status,
            confidence=match.confidence,
            matched_text=match.transcribed_text,
            segment_id=match.segment_id,
        )

        # Log state change
        self.session_logger.log_state_change(
            item_id, new_status.value, match.confidence
        )

        # Check for failures → generate critical alert
        if new_status == ItemStatus.FAILED:
            item_cfg = self.config.get_item(item_id)
            self.alert_generator.generate_critical(
                "RULE_002",
                f"ITEM FAILED: '{item_cfg.name if item_cfg else item_id}' — "
                f"'{match.transcribed_text[:60]}'",
                stage_id=stage_id,
                item_id=item_id,
            )

        # Low confidence flag
        if match.needs_manual_review:
            self.alert_generator.generate_warning(
                "RULE_006",
                f"Low confidence match for '{match.checklist_item_name}' "
                f"(confidence: {match.confidence:.2%}). Manual review needed.",
                stage_id=stage_id,
                item_id=item_id,
            )

        # Notify UI — checklist update
        await self._fire_callback(self._on_checklist_update, match)

        # Notify UI — progress update
        if self._on_progress:
            progress = self.progress_tracker.get_progress()
            await self._fire_callback(self._on_progress, progress)

    # ── Inactivity Monitor ──────────────────────────────────

    async def _inactivity_monitor(self) -> None:
        """Monitor for inactivity and generate alerts."""
        while self.is_active:
            await asyncio.sleep(30)

            if self.is_paused:
                continue

            elapsed = time.time() - self._last_activity_time
            if elapsed >= self._inactivity_timeout:
                self.alert_generator.generate_warning(
                    "RULE_007",
                    f"No checklist activity for {int(elapsed)} seconds.",
                )
                self._last_activity_time = time.time()

    # ── Manual Override ─────────────────────────────────────

    async def manual_override(
        self,
        item_id: str,
        status_str: str,
    ) -> bool:
        """Manually override a checklist item status."""
        try:
            status = ItemStatus(status_str)
        except ValueError:
            logger.error(f"Invalid status: {status_str}")
            return False

        result = self.state_manager.update_item(
            item_id=item_id,
            status=status,
            confidence=1.0,
            matched_text="MANUAL OVERRIDE",
            updated_by="MANUAL",
        )

        if result:
            self.alert_generator.generate_info(
                "MANUAL_OVERRIDE",
                f"Item '{result.item_name}' manually set to {status.value}",
                item_id=item_id,
                stage_id=result.stage_id,
            )

            # Broadcast progress after manual override
            if self._on_progress:
                progress = self.progress_tracker.get_progress()
                await self._fire_callback(self._on_progress, progress)

            return True

        return False