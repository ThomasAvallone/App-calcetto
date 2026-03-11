const LAT = 44.4949;
const LON = 11.3426;

// WMO weather code → our condition string
function mapCode(code, windspeed) {
  if (windspeed > 35) return { condition: 'wind', description: 'Vento forte' };
  if (code === 0)    return { condition: 'sunny',  description: 'Sereno' };
  if (code <= 3)     return { condition: 'cloudy', description: 'Parzialmente nuvoloso' };
  if (code <= 48)    return { condition: 'cloudy', description: 'Nebbia' };
  if (code <= 57)    return { condition: 'rainy',  description: 'Pioviggine' };
  if (code <= 67)    return { condition: 'rainy',  description: 'Pioggia' };
  if (code <= 77)    return { condition: 'cold',   description: 'Neve' };
  if (code <= 82)    return { condition: 'rainy',  description: 'Rovesci' };
  if (code <= 99)    return { condition: 'rainy',  description: 'Temporale' };
  return { condition: 'cloudy', description: '' };
}

function applyTemp(condition, temp) {
  if (temp < 5)  return 'cold';
  if (temp > 28) return 'hot';
  return condition;
}

/**
 * Fetch weather for Bologna at a given date/time.
 * Returns { condition, temp, description } or null on failure / too far in the future.
 */
export async function fetchWeatherForDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffDays = (d - now) / (1000 * 60 * 60 * 24);

  if (diffDays > 16) return null; // Open-Meteo forecast limit

  try {
    if (diffDays < 0.5) {
      // Current conditions
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${LAT}&longitude=${LON}` +
        `&current=temperature_2m,weathercode,windspeed_10m` +
        `&timezone=Europe%2FRome`;
      const json = await fetch(url).then(r => r.json());
      const c = json.current;
      const temp = Math.round(c.temperature_2m);
      const { condition, description } = mapCode(c.weathercode, c.windspeed_10m);
      return { condition: applyTemp(condition, temp), temp: String(temp), description };
    } else {
      // Hourly forecast for the target date (local date, not UTC)
      const pad = n => String(n).padStart(2, '0');
      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${LAT}&longitude=${LON}` +
        `&hourly=temperature_2m,weathercode,windspeed_10m` +
        `&timezone=Europe%2FRome` +
        `&start_date=${dateStr}&end_date=${dateStr}`;
      const json = await fetch(url).then(r => r.json());
      const idx = Math.min(d.getHours(), (json.hourly.time?.length || 1) - 1);
      const temp = Math.round(json.hourly.temperature_2m[idx]);
      const code = json.hourly.weathercode[idx];
      const wind = json.hourly.windspeed_10m[idx];
      const { condition, description } = mapCode(code, wind);
      return { condition: applyTemp(condition, temp), temp: String(temp), description };
    }
  } catch {
    return null;
  }
}
