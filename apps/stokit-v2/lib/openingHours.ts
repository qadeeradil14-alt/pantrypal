/**
 * Extremely lightweight naive parser for OSM opening_hours syntax.
 * Checks if a store is currently open based on the local device time.
 * Returns true if open, false if closed, and null if it cannot confidently parse the string.
 */
export function isCurrentlyOpen(openingHoursStr?: string): boolean | null {
  if (!openingHoursStr) return null;
  const s = openingHoursStr.trim();
  if (s === '24/7') return true;

  const now = new Date();
  // Ensure we are working with local time of the device
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay(); // 0=Sun, 1=Mon, etc.
  
  // Map JS getDay() to OSM days: Mo=1, Tu=2, We=3, Th=4, Fr=5, Sa=6, Su=0
  const osmDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const todayStr = osmDays[day];

  // Map day abbreviations to 1-7 indices (Mo=1, Su=7) for easier range comparison
  const dayIndex: Record<string, number> = { Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 7 };
  const todayIndex = day === 0 ? 7 : day;

  // Split by semicolon (multiple rule sets)
  const rules = s.split(';');
  let ruleMatchedForToday = false;
  let isOpenRightNow = false;

  for (const rule of rules) {
    const trimmedRule = rule.trim();
    if (!trimmedRule) continue;
    
    // Find all time ranges like "08:00-12:00", "13:00-22:00"
    const timeMatches = [...trimmedRule.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)];
    
    let daysPart = '';
    if (timeMatches.length > 0) {
       daysPart = trimmedRule.substring(0, timeMatches[0].index).trim();
    } else if (trimmedRule.includes('off') || trimmedRule.includes('closed')) {
       daysPart = trimmedRule.replace(/off|closed/g, '').trim();
    } else {
       // Cannot parse
       continue;
    }

    let appliesToToday = false;
    if (!daysPart) {
      // No days specified usually means "every day"
      appliesToToday = true;
    } else {
      // Split by comma for things like "Mo-Fr, Su"
      const dayGroups = daysPart.split(',');
      for (const group of dayGroups) {
        const g = group.trim();
        const rangeMatch = g.match(/(Mo|Tu|We|Th|Fr|Sa|Su)\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su)/);
        if (rangeMatch) {
          const startDay = dayIndex[rangeMatch[1]];
          const endDay = dayIndex[rangeMatch[2]];
          if (startDay <= endDay) {
            if (todayIndex >= startDay && todayIndex <= endDay) appliesToToday = true;
          } else {
            // Wrap around like Sa-Mo
            if (todayIndex >= startDay || todayIndex <= endDay) appliesToToday = true;
          }
        } else if (g.includes(todayStr)) {
          appliesToToday = true;
        }
      }
    }

    if (appliesToToday) {
      ruleMatchedForToday = true;
      if (timeMatches.length > 0) {
        let withinTime = false;
        for (const match of timeMatches) {
          const parseTime = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
          };
          const startMins = parseTime(match[1]);
          let endMins = parseTime(match[2]);
          // Handle overnight ranges like "10:00-02:00" mapping end to next day
          if (endMins < startMins) endMins += 24 * 60;

          if (currentMinutes >= startMins && currentMinutes <= endMins) {
            withinTime = true;
            break;
          } else if (endMins > 24 * 60 && currentMinutes + 24 * 60 <= endMins) {
            withinTime = true;
            break;
          }
        }
        isOpenRightNow = withinTime;
      } else if (trimmedRule.includes('off') || trimmedRule.includes('closed')) {
        isOpenRightNow = false;
      }
    }
  }

  if (ruleMatchedForToday) {
    return isOpenRightNow;
  }

  return null;
}
