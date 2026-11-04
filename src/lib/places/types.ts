export type PlaceSort =
  | "name"
  | "top-rated"
  | "soonest-available"
  | "most-available";

export interface AvailabilitySlot {
  startsAt: string;
  remainingSeats: number;
}

export interface PlaceAvailability {
  nextAvailableSlot: AvailabilitySlot | null;
  nextUpcomingSlot: AvailabilitySlot | null;
  availableSlotCount: number;
  maxAvailableSeats: number;
}
