import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { generateMatchPreview } from '../services/reportService';
import { fetchWeatherForDate } from '../services/weatherService';

// Logica condivisa della "Match Preview" tra MatchSetupPage e
// ScheduledMatchDetailPage: costruzione testo + copia + condivisione WhatsApp.
//
// Invariante meteo: l'auto-fetch avviene SOLO se l'utente non ha già inserito
// la temperatura a mano (`weather.temp` vuoto). Copiare/condividere la preview
// non deve mai sovrascrivere silenziosamente la condizione/temperatura scelte.
export function useMatchPreview({ teams, weather, matchDate, setWeather, setPreview }) {
  const buildFreshPreview = useCallback(async () => {
    const date = matchDate ? new Date(matchDate) : new Date();
    let w = weather;
    if (!weather.temp) {
      const fw = await fetchWeatherForDate(date).catch(() => null);
      if (fw) { w = fw; setWeather(fw); }
    }
    const text = generateMatchPreview({ redTeam: teams.red, blueTeam: teams.blue, weather: w, date });
    setPreview(text);
    return text;
  }, [teams, weather, matchDate, setWeather, setPreview]);

  const copyPreview = useCallback(async () => {
    const text = await buildFreshPreview();
    navigator.clipboard.writeText(text)
      .then(() => toast.success('Preview copiata!'))
      .catch(() => toast.error('Copia non riuscita'));
  }, [buildFreshPreview]);

  const shareWhatsApp = useCallback(async () => {
    const text = await buildFreshPreview();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }, [buildFreshPreview]);

  return { buildFreshPreview, copyPreview, shareWhatsApp };
}
