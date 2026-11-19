import type {
  VoiceCommentaryRequest,
  VoiceEmotion,
  VoiceSpeakingStyle,
} from '@ngegame/shared';

export function generateIndonesianCommentary(
  request: VoiceCommentaryRequest,
  style: VoiceSpeakingStyle,
): { text: string; emotion: VoiceEmotion } {
  const game = request.gameTitle || 'game ini';
  const details = request.details || 'situasi baru terdeteksi';
  const event = request.eventType.toUpperCase();

  if (event.includes('EMERGENCY') || event.includes('DANGER') || event.includes('LOW_HP')) {
    const emotion: VoiceEmotion = request.emotion ?? 'tense';
    const text =
      style === 'taktis'
        ? `Perhatian di ${game}: ${details}. Ambil posisi aman terlebih dahulu.`
        : `Waduh, hati-hati di ${game}! ${details}. Kita rem dulu dan amankan posisi.`;
    return { text, emotion };
  }

  if (event.includes('HIGH_MOTION') || event.includes('ACTION') || event.includes('HIGHLIGHT')) {
    const emotion: VoiceEmotion = request.emotion ?? 'excited';
    const text =
      style === 'ekspresif'
        ? `Nah ini dia momen serunya di ${game}! ${details}. Gas terus tapi tetap terukur!`
        : `Oke, ada pergerakan menarik di ${game}: ${details}. Kita ikuti pelan-pelan.`;
    return { text, emotion };
  }

  if (event.includes('SCENE_TRANSITION')) {
    const emotion: VoiceEmotion = request.emotion ?? 'calm';
    const text = `Kita berpindah area di ${game}. ${details}.`;
    return { text, emotion };
  }

  const emotion: VoiceEmotion = request.emotion ?? 'neutral';
  const text =
    style === 'santai'
      ? `Sementara di ${game}, ${details}. Santai aja, kita pantau langkah berikutnya.`
      : `Update ${game}: ${details}.`;
  return { text, emotion };
}
