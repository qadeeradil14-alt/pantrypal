import { searchNearbyStoresByName } from './core/services/places';
async function run() {
  const res = await searchNearbyStoresByName(38.638, -77.345, "Sam's Club");
  console.log("Result:", res);
}
run();
