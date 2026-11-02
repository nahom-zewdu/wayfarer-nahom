import { openDatabase } from "../src/lib/db/database";
import { seedDatabase } from "../src/lib/db/seed";

const db = openDatabase();

try {
  const counts = seedDatabase(db);
  console.log(
    `Database records: users=${counts.users}, places=${counts.places}, reviews=${counts.reviews}, tour_slots=${counts.tourSlots}, bookings=${counts.bookings}`,
  );
} finally {
  db.close();
}
