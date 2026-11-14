#!/usr/bin/env python3
# Shared tools for the crew voices (used by build_voices.py and voice_report.py). Nobody can listen in the workspace, so
# everything here is either a transformation with stated settings or a measurement.
#
# FOUR MEN, FOUR VOICES. The voice pack may be one or two actors. Each crewman's clips are therefore re-voiced once, when
# the sound files are built (never at play time): pitch and vocal-tract size (formants) are moved INDEPENDENTLY, so it is
# not a tape-speed change, plus a different pace and microphone colour. Tool: the Rubber Band library (through ffmpeg's
# `rubberband` filter, in its quality mode), two passes:
#   pass 1 scales everything by the formant factor F (pitch and formants together),
#   pass 2 moves the pitch alone by P / F with the formants held, and sets the pace.
# Result: pitch x P, formants x F, pace x T. Then a gentle tone curve (shelves and one peak) for the man's microphone.
import os, subprocess, json
import numpy as np

SR = 44100
# P in semitones, F formant factor, T pace, then ffmpeg equaliser steps
ROLES = {
    'CDR': dict(semi=-1.4, formant=0.965, pace=1.00, eq='lowshelf=f=180:g=2,equalizer=f=2500:t=q:w=1.2:g=1.5'),
    'GNR': dict(semi=0.0, formant=1.045, pace=1.03, eq='highshelf=f=3000:g=2,equalizer=f=1100:t=q:w=1.0:g=-1.5'),
    'LDR': dict(semi=+3.2, formant=1.065, pace=1.06, eq='lowshelf=f=220:g=-3,equalizer=f=3200:t=q:w=1.2:g=2.5'),
    'DRV': dict(semi=-3.2, formant=0.94, pace=0.96, eq='lowshelf=f=160:g=2.5,highshelf=f=3400:g=-1'),
    'HQ': None,    # the radio net keeps the pack's own voice
}

def run_ffmpeg(x, flt, sr=SR):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-', '-af', flt, '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-'],
                       input=np.asarray(x, dtype=np.float32).tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)

def load(path, sr=SR):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)

def revoice(x, role, extra_semi=0.0, extra_pace=1.0):
    R = ROLES.get(role)
    if not R: return np.asarray(x, dtype=np.float64)
    P = 2 ** ((R['semi'] + extra_semi) / 12); F = R['formant']; T = R['pace'] * extra_pace
    pad = np.zeros(int(SR * 0.15)); y = np.concatenate([pad, x, pad])   # the shifter needs a run-in
    flt = 'rubberband=pitch=%.5f:formant=shifted:pitchq=quality,rubberband=pitch=%.5f:tempo=%.4f:formant=preserved:pitchq=quality,%s' % (F, P / F, T, R['eq'])
    return run_ffmpeg(y, flt)

def trim(a, lead=0.02, tail=0.06):
    n = int(SR * 0.01); k = len(a) // n
    if k < 3: return a
    e = 20 * np.log10(np.sqrt((a[:k * n].reshape(k, n) ** 2).mean(1)) + 1e-9); on = np.nonzero(e > max(e.max() - 38, -60))[0]
    lo = max(0, on[0] * n - int(SR * lead)); hi = min(len(a), (on[-1] + 1) * n + int(SR * tail)); return a[lo:hi].copy()

def loudness(a):   # loudness of the frames with speech in them, dB below full scale
    n = int(SR * 0.01); k = len(a) // n; e = 20 * np.log10(np.sqrt((a[:k * n].reshape(k, n) ** 2).mean(1)) + 1e-9)
    loud = e[e > e.max() - 25]; return 10 * np.log10((10 ** (loud / 10)).mean())

def level(a, target=-19.0, ceil=-1.5):
    g = 10 ** ((target - loudness(a)) / 20); pk = np.abs(a).max() * g; lim = 10 ** (ceil / 20)
    if pk > lim: g *= lim / pk
    a = a * g; f = int(SR * 0.006); a[:f] *= np.linspace(0, 1, f); a[-f:] *= np.linspace(1, 0, f); return a

def ltas(a, n=2048):   # long-term average spectrum in dB, on n/2+1 bins
    if len(a) < n: a = np.concatenate([a, np.zeros(n - len(a))])
    w = np.hanning(n); S = np.zeros(n // 2 + 1); c = 0
    for i in range(0, len(a) - n + 1, n // 2): S += np.abs(np.fft.rfft(a[i:i + n] * w)) ** 2; c += 1
    return 10 * np.log10(S / max(1, c) + 1e-12)

def match_eq(a, target_db, own_db=None, n=2048, limit=9.0):
    # bend the long-term spectrum of `a` towards the target (third-octave smoothed, at most +-limit dB): the made lines
    # get the pack's microphone and room colour
    own = ltas(a, n) if own_db is None else own_db; f = np.fft.rfftfreq(n, 1 / SR); d = target_db - own
    sm = np.zeros_like(d)
    for i, fc in enumerate(f):
        lo, hi = fc / 1.26, fc * 1.26 + 30; k = (f >= lo) & (f <= hi); sm[i] = d[k].mean()
    sm -= sm[(f > 300) & (f < 3000)].mean(); sm = np.clip(sm, -limit, limit); sm[f < 70] = 0
    N = 1 << int(np.ceil(np.log2(len(a) + n))); A = np.fft.rfft(a, N); ff = np.fft.rfftfreq(N, 1 / SR)
    return np.fft.irfft(A * 10 ** (np.interp(ff, f, sm) / 20), N)[:len(a)]

def measure(a):
    # what a voice "is", in numbers: pitch (median and range), the first three formants, roughness of the voice
    # (jitter, shimmer, harmonics-to-noise), brightness, and how fast the loudness moves (syllable rate)
    import parselmouth
    from parselmouth.praat import call
    snd = parselmouth.Sound(np.asarray(a, dtype=np.float64), SR); out = {}
    pitch = snd.to_pitch(time_step=0.01, pitch_floor=70, pitch_ceiling=500); f0 = pitch.selected_array['frequency']; v = f0[f0 > 0]
    out['voiced'] = len(v) / max(1, len(f0))
    if len(v) < 5: return dict(out, f0=0, f0_range=0, f1=0, f2=0, f3=0, jitter=0, shimmer=0, hnr=0, centroid=0, mod=0)
    out['f0'] = float(np.median(v)); out['f0_range'] = float(12 * np.log2(np.percentile(v, 90) / np.percentile(v, 10)))
    fm = snd.to_formant_burg(time_step=0.01, max_number_of_formants=5, maximum_formant=5000); ts = pitch.xs(); F = [[], [], []]
    for t, p in zip(ts, f0):
        if p <= 0: continue
        for k in range(3):
            x = fm.get_value_at_time(k + 1, t)
            if x == x: F[k].append(x)
    out['f1'], out['f2'], out['f3'] = [float(np.median(q)) if q else 0 for q in F]
    try:
        pp = call(snd, 'To PointProcess (periodic, cc)', 70, 500)
        out['jitter'] = float(call(pp, 'Get jitter (local)', 0, 0, 0.0001, 0.02, 1.3)) * 100
        out['shimmer'] = float(call([snd, pp], 'Get shimmer (local)', 0, 0, 0.0001, 0.02, 1.3, 1.6)) * 100
    except Exception: out['jitter'] = out['shimmer'] = 0.0
    try: h = snd.to_harmonicity_cc(0.01, 70, 0.1, 1.0).values; h = h[h > -100]; out['hnr'] = float(h.mean()) if h.size else 0.0
    except Exception: out['hnr'] = 0.0
    S = np.abs(np.fft.rfft(a * np.hanning(len(a)))) ** 2; f = np.fft.rfftfreq(len(a), 1 / SR); out['centroid'] = float((S * f).sum() / (S.sum() + 1e-20))
    n = int(SR * 0.01); k = len(a) // n; env = np.sqrt((a[:k * n].reshape(k, n) ** 2).mean(1)); env = env - env.mean()
    if k > 20:
        E = np.abs(np.fft.rfft(env * np.hanning(k))); fe = np.fft.rfftfreq(k, 0.01); band = (fe >= 1.5) & (fe <= 12); out['mod'] = float(fe[band][np.argmax(E[band])]) if band.any() else 0.0
    else: out['mod'] = 0.0
    for key in out:
        if out[key] != out[key]: out[key] = 0.0
    return out

def on_intercom(a):
    # the band a crewman is heard in once he is on the intercom: comparisons between made and real lines are made here
    return run_ffmpeg(a, 'highpass=f=300,highpass=f=270,lowpass=f=3300,lowpass=f=3800')

KEYS = ['f0', 'f0_range', 'f1', 'f2', 'f3', 'jitter', 'shimmer', 'hnr', 'centroid']
