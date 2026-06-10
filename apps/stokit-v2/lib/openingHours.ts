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
    // Look for times like "08:00-22:00"
    const timeMatch = rule.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (!timeMatch) continue;

    const parseTime = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    
    const startMins = parseTime(timeMatch[1]);
    let endMins = parseTime(timeMatch[2]);
    // Handle overnight ranges like "10:00-02:00" mapping end to next day
    if (endMins < startMins) {
      endMins += 24 * 60; 
    }

    // Is current time within range? Handle overnight shifts.
    let withinTime = false;
    if (currentMinutes >= startMins && currentMinutes <= endMins) {
      withinTime = true;
    } else if (endMins > 24 * 60) {
      // If it's overnight and we're currently in the morning (e.g. 01:00 <= 02:00)
      if (currentMinutes + 24 * 60 <= endMins) {
        withinTime = true;
      }
    }

    const daysPart = rule.substring(0, timeMatch.index).trim();
    let appliesToToday = false;

    if (!daysPart) {
      // No days specified usually means "every day"
      appliesToToday = true;
    } else {
      // "Mo-Fr"
      const rangeMatch = daysPart.match(/(Mo|Tu|We|Th|Fr|Sa|Su)\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su)/);
      if (rangeMatch) {
        const startDay = dayIndex[rangeMatch[1]];
        const endDay = dayIndex[rangeMatch[2]];
        if (startDay <= endDay) {
          appliesToToday = todayIndex >= startDay && todayIndex <= endDay;
        } else {
          // Wrap around like Sa-Mo
          appliesToToday = todayIndex >= startDay || todayIndex <= endDay;
        }
      } else if (daysPart.includes(todayStr)) {
        // "Mo,We,Fr"
        appliesToToday = true;
      } else if (daysPart === 'off') {
         // Some strings end with "off", meaning closed, which doesn't match our regex well.
         continue;
      }
    }

    if (appliesToToday) {
      ruleMatchedForToday = true;
      if (withinTime) {
        isOpenRightNow = true;
      }
    }
  }

  // If a rule matched today, return whether the time fell within that rule.
  // Otherwise, fallback to null (couldn't confidently parse)
  if (ruleMatchedForToday) {
    return isOpenRightNow;
  }

  return null;
}
