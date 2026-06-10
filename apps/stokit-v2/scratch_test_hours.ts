import { isCurrentlyOpen } from './lib/openingHours';

console.log('08:00-22:00', isCurrentlyOpen('08:00-22:00'));
console.log('Mo-Su 08:00-22:00', isCurrentlyOpen('Mo-Su 08:00-22:00'));
console.log('Mo-Fr 10:00-20:00; Sa 09:00-20:00; Su 10:00-18:00', isCurrentlyOpen('Mo-Fr 10:00-20:00; Sa 09:00-20:00; Su 10:00-18:00'));
console.log('Mo-Fr 08:00-22:00; Sa, Su 08:00-21:00', isCurrentlyOpen('Mo-Fr 08:00-22:00; Sa, Su 08:00-21:00'));
