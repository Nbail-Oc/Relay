"""Pipecat Gnani speech runtime; all assistant turns are handled by the authenticated app API."""
import os
from pathlib import Path
import aiohttp
from dotenv import load_dotenv
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMContextFrame, LLMFullResponseEndFrame, LLMFullResponseStartFrame, LLMTextFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair, LLMUserAggregatorParams
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.transcriptions.language import Language
from pipecat.transports.base_transport import TransportParams
from pipecat_gnani import GnaniSSETTSService, GnaniSTTService

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")
TRANSPORTS = {"webrtc": lambda: TransportParams(audio_in_enabled=True, audio_out_enabled=True)}


class AssistantTurnGateway(FrameProcessor):
    """Send each final Pipecat user turn to the same policy/model handler as text chat."""
    def __init__(self, *, session, app_url, access_token, conversation_id, attachment_ids):
        super().__init__()
        self._session = session
        self._url = app_url.rstrip("/") + "/api/assistant/turn"
        self._token = access_token
        self._conversation_id = conversation_id
        self._attachment_ids = attachment_ids
        self._turn_lock = __import__("asyncio").Lock()

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if not isinstance(frame, LLMContextFrame) or frame.speculation:
            await self.push_frame(frame, direction)
            return
        async with self._turn_lock:
            messages = frame.context.get_messages()
            user_text = next((m.get("content", "") for m in reversed(messages) if m.get("role") == "user" and isinstance(m.get("content"), str)), "").strip()
            if not user_text:
                await self.push_frame(frame, direction)
                return
            payload = {"conversationId": self._conversation_id, "text": user_text, "messageId": __import__("uuid").uuid4().hex, "attachmentIds": self._attachment_ids, "waitForResponse": True}
            try:
                async with self._session.post(self._url, json=payload, headers={"Authorization": f"Bearer {self._token}"}, timeout=aiohttp.ClientTimeout(total=90)) as response:
                    result = await response.json()
                    if response.status >= 400:
                        raise RuntimeError(result.get("error") or f"Assistant API returned {response.status}")
                reply = str(result.get("message", {}).get("content", ""))
                if not reply:
                    reply = "I’m ready to continue."
            except Exception as error:
                # Never fall through to a second LLM: that would bypass mode policy and PayPal confirmations.
                reply = f"I couldn’t complete that turn. {str(error)[:240]} You can retry by voice or text."
            await self.push_frame(LLMFullResponseStartFrame(), FrameDirection.DOWNSTREAM)
            await self.push_frame(LLMTextFrame(reply), FrameDirection.DOWNSTREAM)
            await self.push_frame(LLMFullResponseEndFrame(), FrameDirection.DOWNSTREAM)


async def bot(runner_args: RunnerArguments):
    body = runner_args.body if isinstance(runner_args.body, dict) else {}
    gnani_keys = [os.getenv("GNANI_API_KEY"), os.getenv("GNANI_API_KEY_BACKUP")]
    key_index = min(max(int(body.get("key_index", 0)), 0), 1)
    gnani = gnani_keys[key_index] or next((key for key in gnani_keys if key), None)
    access_token = body.get("access_token")
    conversation_id = body.get("conversation_id")
    app_url = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
    if not gnani:
        raise RuntimeError("Set GNANI_API_KEY in .env.local or the runtime environment.")
    if not access_token or not conversation_id:
        raise RuntimeError("A signed-in chat session is required.")
    transport = await create_transport(runner_args, TRANSPORTS)
    async with aiohttp.ClientSession() as session:
        stt = GnaniSTTService(api_key=gnani, sample_rate=16000, settings=GnaniSTTService.Settings(language=Language.EN_IN))
        tts = GnaniSSETTSService(api_key=gnani, aiohttp_session=session, sample_rate=16000, settings=GnaniSSETTSService.Settings(voice="Nalini", language=Language.EN_IN))
        context_pair = LLMContextAggregatorPair(LLMContext(), user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()))
        gateway = AssistantTurnGateway(session=session, app_url=app_url, access_token=access_token, conversation_id=conversation_id, attachment_ids=body.get("attachment_ids", []))
        task = PipelineTask(Pipeline([transport.input(), stt, context_pair.user(), gateway, tts, transport.output(), context_pair.assistant()]), params=PipelineParams(enable_metrics=True))

        @transport.event_handler("on_client_disconnected")
        async def disconnected(_transport, _client):
            await task.cancel()

        await PipelineRunner(handle_sigint=runner_args.handle_sigint).run(task)


if __name__ == "__main__":
    # Pipecat's runner logs full request JSON at DEBUG by default; it contains the user JWT.
    from loguru import logger

    def redact_session_request(record):
        if record["message"].startswith("Received request: "):
            record["message"] = "Received voice session request (payload redacted)"

    logger.configure(patcher=redact_session_request)
    from pipecat.runner.run import main
    main()
