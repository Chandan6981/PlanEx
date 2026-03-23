import { useState, useRef, useEffect, useCallback } from 'react';

const getSpeechRecognition = () =>
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

export const isSpeechSupported   = () => !!getSpeechRecognition();
export const isMediaRecSupported = () => typeof MediaRecorder !== 'undefined';

// Best supported audio mime type for current browser
export const getBestAudioMime = () => {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  if (!isMediaRecSupported()) return '';
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
};

const ERROR_MESSAGES = {
  'not-allowed':          'Microphone access denied. Enable it in browser settings.',
  'audio-capture':        'No microphone found. Please connect one and try again.',
  'network':              'Voice input requires an internet connection.',
  'no-speech':            "Couldn't hear anything. Please try again.",
  'aborted':              null,
  'service-not-allowed':  'Voice input is blocked in this browser.',
  'bad-grammar':          'Voice input failed. Please try again.',
  'language-not-supported': 'Please speak in English.',
};

/**
 * useSpeechToText
 * Handles both transcript (SpeechRecognition) and audio recording (MediaRecorder)
 * for a single field.
 *
 * @param fieldId        — unique id for this field ('title' | 'description' | 'comment')
 * @param activeField    — which field is currently listening (from parent)
 * @param setActiveField — setter from parent
 * @param onResult       — called with { transcript, audioBlob, mimeType } when done
 * @param onError        — called with error message string
 */
export const useSpeechToText = ({
  fieldId,
  activeField,
  setActiveField,
  onResult,
  onError,
}) => {
  const recognitionRef  = useRef(null);
  const mediaRecRef     = useRef(null);
  const chunksRef       = useRef([]);
  const streamRef       = useRef(null);
  const startTimeRef    = useRef(null);
  const isMountedRef    = useRef(true);

  const listening = activeField === fieldId;

  // Cleanup on unmount — release ALL resources
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  // eslint-disable-line
  }, []);

  const cleanup = () => {
    // Stop recognition
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    // Stop media recorder
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      try { mediaRecRef.current.stop(); } catch {}
      mediaRecRef.current = null;
    }
    // Release mic stream — removes browser "recording" indicator
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    chunksRef.current  = [];
    startTimeRef.current = null;
  };

  const stop = useCallback(() => {
    cleanup();
    if (isMountedRef.current) setActiveField(null);
  }, [setActiveField]);

  const start = useCallback(async () => {
    // 1. Browser support check
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      onError?.('Voice input is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    // 2. HTTPS check (localhost exempt)
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (!isLocalhost && window.location.protocol !== 'https:') {
      onError?.('Voice input requires HTTPS. Please use a secure connection.');
      return;
    }

    // 3. Toggle off if already listening
    if (listening) { stop(); return; }

    // 4. Stop any other active field
    if (recognitionRef.current || mediaRecRef.current) cleanup();

    // 5. Request mic permission ONCE — shared by both APIs
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
    } catch (err) {
      const msgMap = {
        NotAllowedError:       'Microphone access denied. Enable it in browser settings.',
        NotFoundError:         'No microphone found. Please connect one.',
        NotReadableError:      'Microphone is in use by another app.',
        OverconstrainedError:  'Microphone device issue. Please try again.',
        AbortError:            'Microphone access was aborted. Please try again.',
      };
      onError?.(msgMap[err.name] || `Microphone error: ${err.message}`);
      return;
    }

    // 6. Set up MediaRecorder (audio recording) if supported
    const mimeType = getBestAudioMime();
    chunksRef.current = [];

    if (isMediaRecSupported() && mimeType) {
      try {
        const recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = (e) => {
          if (e.data?.size > 0) chunksRef.current.push(e.data);
        };
        // ondataavailable fires after stop() — audio is ready
        mediaRecRef.current = recorder;
        recorder.start(100); // collect data every 100ms
      } catch (err) {
        // MediaRecorder setup failed — continue with transcript only
        console.warn('MediaRecorder setup failed:', err.message);
        mediaRecRef.current = null;
      }
    }

    // 7. Set up SpeechRecognition (transcript)
    const recognition         = new SpeechRecognition();
    recognition.lang           = 'en-US';
    recognition.continuous     = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let transcript = '';

    recognition.onstart = () => {
      startTimeRef.current = Date.now();
      if (isMountedRef.current) setActiveField(fieldId);
    };

    recognition.onresult = (e) => {
      transcript = e.results?.[0]?.[0]?.transcript?.trim() || '';
    };

    recognition.onerror = (e) => {
      const msg = ERROR_MESSAGES[e.error];
      if (msg !== null && isMountedRef.current) {
        onError?.(msg || `Voice error: ${e.error}`);
      }
    };

    recognition.onend = () => {
      // Stop MediaRecorder — triggers ondataavailable with final chunk
      if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
        mediaRecRef.current.onstop = () => {
          if (!isMountedRef.current) { cleanup(); return; }

          const duration = startTimeRef.current
            ? (Date.now() - startTimeRef.current) / 1000
            : 0;

          const audioBlob = chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type: mimeType })
            : null;

          // Release mic stream
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
          }

          if (isMountedRef.current) {
            setActiveField(null);
            onResult?.({ transcript, audioBlob, mimeType, duration });
          }

          chunksRef.current = [];
          mediaRecRef.current = null;
        };
        mediaRecRef.current.stop();
      } else {
        // No MediaRecorder — just return transcript
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        if (isMountedRef.current) {
          setActiveField(null);
          onResult?.({ transcript, audioBlob: null, mimeType: '', duration: 0 });
        }
      }

      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      cleanup();
      if (isMountedRef.current) {
        setActiveField(null);
        onError?.('Could not start voice input. Please try again.');
      }
    }
  }, [listening, fieldId, onResult, onError, setActiveField, stop]);

  return { listening, start, stop };
};