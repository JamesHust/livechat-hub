import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceRecorderError = 'permission' | 'unsupported' | 'failed';

export interface RecordedClip {
  file: File;
  durationMs: number;
}

export interface VoiceRecorder {
  /** True while actively capturing audio. */
  isRecording: boolean;
  /** Elapsed recording time in milliseconds (for the live timer). */
  elapsedMs: number;
  /** Last error, or `null`. Cleared when a new recording starts. */
  error: VoiceRecorderError | null;
  /** Whether the platform supports recording at all. */
  supported: boolean;
  start: () => Promise<void>;
  /** Stop and return the recorded clip, or `null` if nothing was captured. */
  stop: () => Promise<RecordedClip | null>;
  /** Discard the in-progress recording without producing a clip. */
  cancel: () => void;
}

const supported =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof MediaRecorder !== 'undefined';

/**
 * Thin wrapper over `MediaRecorder` + `getUserMedia` for capturing a voice
 * message. The recorder, stream and chunks live in refs so re-renders (the
 * ticking timer) never tear them down; everything is released on stop/cancel/
 * unmount to free the microphone.
 */
export function useVoiceRecorder(): VoiceRecorder {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<VoiceRecorderError | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const teardown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    if (!supported || recorderRef.current) return;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('permission');
      return;
    }
    try {
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      streamRef.current = stream;
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      recorder.start();
      setIsRecording(true);
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setError('failed');
    }
  }, []);

  const stop = useCallback(async (): Promise<RecordedClip | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;
    const durationMs = Date.now() - startedAtRef.current;
    const mimeType = recorder.mimeType || 'audio/webm';
    const done = new Promise<RecordedClip | null>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        if (blob.size === 0) {
          resolve(null);
          return;
        }
        const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `voice-message-${startedAtRef.current}.${ext}`, {
          type: mimeType,
        });
        resolve({ file, durationMs });
      };
    });
    recorder.stop();
    const clip = await done;
    teardown();
    return clip;
  }, [teardown]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // Already inactive — ignore.
      }
    }
    chunksRef.current = [];
    teardown();
  }, [teardown]);

  // Release the microphone if the composer unmounts mid-recording.
  useEffect(() => () => teardown(), [teardown]);

  return { isRecording, elapsedMs, error, supported, start, stop, cancel };
}
