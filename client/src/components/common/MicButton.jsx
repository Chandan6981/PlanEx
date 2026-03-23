import React from 'react';

/**
 * MicButton — reusable voice input trigger
 *
 * Props:
 *   listening  {bool}     — is this button currently recording
 *   onStart    {function} — called when user clicks to start
 *   disabled   {bool}     — disable the button entirely
 *   size       {number}   — icon size in px (default 13)
 */
export default function MicButton({ listening, onStart, disabled = false, size = 13 }) {
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled}
      title={listening ? 'Listening… click to stop' : 'Click to speak'}
      style={{
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        width:           28,
        height:          28,
        borderRadius:    'var(--radius-sm)',
        border:          `1px solid ${listening ? 'var(--red)' : 'var(--border)'}`,
        background:      listening ? 'var(--red-dim)' : 'var(--bg-tertiary)',
        color:           listening ? 'var(--red)' : 'var(--text-muted)',
        cursor:          disabled ? 'not-allowed' : 'pointer',
        opacity:         disabled ? 0.4 : 1,
        flexShrink:      0,
        transition:      'all 0.15s ease',
        animation:       listening ? 'micPulse 1s ease-in-out infinite' : 'none',
      }}>
      {listening ? (
        // Waveform icon while recording
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1"  x2="12" y2="23"/>
          <line x1="8"  y1="5"  x2="8"  y2="19"/>
          <line x1="4"  y1="9"  x2="4"  y2="15"/>
          <line x1="16" y1="5"  x2="16" y2="19"/>
          <line x1="20" y1="9"  x2="20" y2="15"/>
        </svg>
      ) : (
        // Mic icon when idle
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8"  y1="23" x2="16" y2="23"/>
        </svg>
      )}
    </button>
  );
}