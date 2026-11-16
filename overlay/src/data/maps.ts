export interface MapRoom {
  id: string;
  name: string;
  floor: string;
  x: number; // percentage 0..100
  y: number;
  w: number;
  h: number;
  hasBreaker?: boolean;
  cursedItem?: string;
  loopSpot?: boolean;
  lightCount?: number;
  hidingSpot?: boolean;
}

export interface PhasmoMap {
  name: string;
  size: 'Small' | 'Medium' | 'Large';
  floors: string[];
  maxLights: number; // in-game fuse box trip capacity
  fuseboxSpawns: { floor: string; location: string }[];
  cursedSpawns: { item: string; location: string }[];
  rooms: MapRoom[];
}

export const PHASMO_MAPS: PhasmoMap[] = [
  {
    name: '6 Tanglewood Drive',
    size: 'Small',
    floors: ['Ground Floor', 'Basement'],
    maxLights: 9,
    fuseboxSpawns: [
      { floor: 'Ground Floor', location: 'Garage wall by the locker workbench' },
      { floor: 'Basement', location: 'Basement back wall next to metal shelving' },
    ],
    cursedSpawns: [
      { item: 'Haunted Mirror', location: 'Master Bedroom entrance hallway wall' },
      { item: 'Music Box', location: 'Nursery shelf immediately right of the door' },
      { item: 'Ouija Board', location: 'Basement rear table' },
      { item: 'Summoning Circle', location: 'Basement center floor' },
      { item: 'Tarot Cards', location: 'Living Room end table beside the sofa window' },
      { item: 'Voodoo Doll', location: 'Garage trash bin corner' },
      { item: 'Monkey Paw', location: 'Dining Room glass display cabinet' },
    ],
    rooms: [
      { id: 'foyer', name: 'Foyer', floor: 'Ground Floor', x: 38, y: 68, w: 14, h: 24, lightCount: 1 },
      { id: 'boy_bed', name: 'Boys Bedroom', floor: 'Ground Floor', x: 10, y: 66, w: 26, h: 26, lightCount: 1, hidingSpot: true },
      { id: 'bathroom', name: 'Main Bathroom', floor: 'Ground Floor', x: 10, y: 46, w: 18, h: 18, lightCount: 1 },
      { id: 'nursery', name: 'Nursery', floor: 'Ground Floor', x: 10, y: 24, w: 22, h: 20, cursedItem: 'Music Box', lightCount: 1, hidingSpot: true },
      { id: 'master', name: 'Master Bedroom', floor: 'Ground Floor', x: 10, y: 4, w: 32, h: 18, cursedItem: 'Mirror', lightCount: 1, hidingSpot: true },
      { id: 'master_bath', name: 'Master Bathroom', floor: 'Ground Floor', x: 44, y: 4, w: 16, h: 18, lightCount: 1 },
      { id: 'living', name: 'Living Room', floor: 'Ground Floor', x: 34, y: 24, w: 26, h: 36, cursedItem: 'Tarot Cards', lightCount: 2 },
      { id: 'dining', name: 'Dining Room', floor: 'Ground Floor', x: 62, y: 6, w: 28, h: 22, cursedItem: 'Monkey Paw', lightCount: 1 },
      { id: 'kitchen', name: 'Kitchen', floor: 'Ground Floor', x: 62, y: 30, w: 28, h: 22, loopSpot: true, lightCount: 2 },
      { id: 'utility', name: 'Utility Room', floor: 'Ground Floor', x: 54, y: 54, w: 14, h: 14, lightCount: 1 },
      { id: 'garage', name: 'Garage', floor: 'Ground Floor', x: 68, y: 54, w: 24, h: 38, hasBreaker: true, cursedItem: 'Voodoo Doll', loopSpot: true, lightCount: 2, hidingSpot: true },
      { id: 'basement', name: 'Basement', floor: 'Basement', x: 32, y: 20, w: 38, h: 52, hasBreaker: true, cursedItem: 'Ouija / Circle', lightCount: 1, hidingSpot: true },
    ],
  },
  {
    name: '13 Willow Street',
    size: 'Small',
    floors: ['Ground Floor', 'Basement'],
    maxLights: 9,
    fuseboxSpawns: [
      { floor: 'Ground Floor', location: 'Garage rear utility corner' },
      { floor: 'Basement', location: 'Basement hallway right wall' },
    ],
    cursedSpawns: [
      { item: 'Haunted Mirror', location: 'Garage small utility room floor' },
      { item: 'Music Box', location: 'Living Room front entrance table' },
      { item: 'Ouija Board', location: 'Garage washing machine shelf' },
      { item: 'Summoning Circle', location: 'Basement center hallway floor' },
      { item: 'Tarot Cards', location: 'Living Room coffee table' },
      { item: 'Voodoo Doll', location: 'Boys Bedroom wardrobe bottom shelf' },
      { item: 'Monkey Paw', location: 'Hallway cabinet shelf' },
    ],
    rooms: [
      { id: 'living', name: 'Living Room', floor: 'Ground Floor', x: 12, y: 54, w: 36, h: 36, cursedItem: 'Music Box / Tarot', lightCount: 2 },
      { id: 'kitchen', name: 'Kitchen & Dining', floor: 'Ground Floor', x: 12, y: 24, w: 36, h: 28, loopSpot: true, lightCount: 2 },
      { id: 'garage', name: 'Garage', floor: 'Ground Floor', x: 50, y: 32, w: 38, h: 58, hasBreaker: true, cursedItem: 'Mirror / Ouija', loopSpot: true, lightCount: 2, hidingSpot: true },
      { id: 'bath', name: 'Bathroom', floor: 'Ground Floor', x: 42, y: 6, w: 18, h: 18, lightCount: 1 },
      { id: 'master', name: 'Master Bedroom', floor: 'Ground Floor', x: 12, y: 6, w: 28, h: 16, lightCount: 1, hidingSpot: true },
      { id: 'boys', name: 'Boys Bedroom', floor: 'Ground Floor', x: 62, y: 6, w: 26, h: 22, cursedItem: 'Voodoo Doll', lightCount: 1, hidingSpot: true },
      { id: 'base_hall', name: 'Basement Hallway', floor: 'Basement', x: 28, y: 24, w: 42, h: 22, hasBreaker: true, cursedItem: 'Summoning Circle', lightCount: 1 },
      { id: 'base_left', name: 'Left Storage Room', floor: 'Basement', x: 14, y: 48, w: 30, h: 34, lightCount: 1, hidingSpot: true },
      { id: 'base_right', name: 'Right Storage Room', floor: 'Basement', x: 56, y: 48, w: 30, h: 34, lightCount: 1, hidingSpot: true },
    ],
  },
  {
    name: '10 Ridgeview Court',
    size: 'Small',
    floors: ['Ground Floor', 'Upper Floor', 'Basement'],
    maxLights: 9,
    fuseboxSpawns: [
      { floor: 'Ground Floor', location: 'Garage workbench wall' },
      { floor: 'Basement', location: 'Basement foot of stairs wall' },
      { floor: 'Basement', location: 'Basement back storage wall' },
    ],
    cursedSpawns: [
      { item: 'Haunted Mirror', location: 'Basement stairs entrance opposite wall' },
      { item: 'Music Box', location: 'Upstairs Girls Bedroom vanity' },
      { item: 'Ouija Board', location: 'Utility room bottom rack' },
      { item: 'Summoning Circle', location: 'Basement floor center' },
      { item: 'Tarot Cards', location: 'Foyer front entry console' },
      { item: 'Voodoo Doll', location: 'Living Room piano bench' },
      { item: 'Monkey Paw', location: 'Upstairs Teen Boys Bedroom desk' },
    ],
    rooms: [
      { id: 'foyer', name: 'Foyer', floor: 'Ground Floor', x: 36, y: 62, w: 24, h: 28, cursedItem: 'Tarot Cards', lightCount: 1 },
      { id: 'living', name: 'Living Room', floor: 'Ground Floor', x: 62, y: 42, w: 28, h: 48, cursedItem: 'Voodoo Doll', lightCount: 2 },
      { id: 'dining', name: 'Dining Room', floor: 'Ground Floor', x: 36, y: 28, w: 24, h: 32, loopSpot: true, lightCount: 1 },
      { id: 'kitchen', name: 'Kitchen', floor: 'Ground Floor', x: 36, y: 6, w: 24, h: 20, loopSpot: true, lightCount: 2 },
      { id: 'garage', name: 'Garage', floor: 'Ground Floor', x: 8, y: 38, w: 26, h: 52, hasBreaker: true, lightCount: 2, hidingSpot: true },
      { id: 'master', name: 'Master Bedroom', floor: 'Ground Floor', x: 8, y: 6, w: 26, h: 28, cursedItem: 'Mirror', lightCount: 1, hidingSpot: true },
      { id: 'up_hall', name: 'Upstairs Hallway', floor: 'Upper Floor', x: 26, y: 36, w: 48, h: 20, lightCount: 2 },
      { id: 'girls', name: 'Girls Bedroom', floor: 'Upper Floor', x: 26, y: 8, w: 22, h: 26, cursedItem: 'Music Box', lightCount: 1, hidingSpot: true },
      { id: 'boys', name: 'Boys Bedroom', floor: 'Upper Floor', x: 52, y: 8, w: 22, h: 26, cursedItem: 'Monkey Paw', lightCount: 1, hidingSpot: true },
      { id: 'basement', name: 'Basement Storage', floor: 'Basement', x: 28, y: 24, w: 44, h: 48, hasBreaker: true, cursedItem: 'Summoning Circle / Ouija', lightCount: 2, hidingSpot: true },
    ],
  },
  {
    name: '42 Edgefield Road',
    size: 'Small',
    floors: ['Ground Floor', 'Upper Floor', 'Basement'],
    maxLights: 9,
    fuseboxSpawns: [
      { floor: 'Ground Floor', location: 'Garage rear entrance wall' },
      { floor: 'Basement', location: 'Basement back storage pillar' },
    ],
    cursedSpawns: [
      { item: 'Haunted Mirror', location: 'Foyer main staircase wall' },
      { item: 'Music Box', location: 'Living Room white wall shelf' },
      { item: 'Ouija Board', location: 'Basement back corner shelving' },
      { item: 'Summoning Circle', location: 'Basement floor center' },
      { item: 'Tarot Cards', location: 'Foyer side table' },
      { item: 'Voodoo Doll', location: 'Upstairs Blue Bedroom bed' },
      { item: 'Monkey Paw', location: 'Upstairs Nursery baby changing table' },
    ],
    rooms: [
      { id: 'foyer', name: 'Foyer & Hall', floor: 'Ground Floor', x: 38, y: 40, w: 20, h: 50, cursedItem: 'Mirror / Tarot', lightCount: 2 },
      { id: 'living', name: 'Living Room', floor: 'Ground Floor', x: 10, y: 48, w: 26, h: 42, cursedItem: 'Music Box', lightCount: 2 },
      { id: 'dining', name: 'Dining Room', floor: 'Ground Floor', x: 10, y: 12, w: 26, h: 34, lightCount: 1 },
      { id: 'kitchen', name: 'Kitchen', floor: 'Ground Floor', x: 38, y: 12, w: 26, h: 26, loopSpot: true, lightCount: 2 },
      { id: 'garage', name: 'Garage', floor: 'Ground Floor', x: 60, y: 42, w: 30, h: 48, hasBreaker: true, lightCount: 2, hidingSpot: true },
      { id: 'upstairs', name: 'Upstairs 6 Bedrooms & Hall', floor: 'Upper Floor', x: 14, y: 14, w: 72, h: 68, cursedItem: 'Voodoo / Paw', lightCount: 4, hidingSpot: true },
      { id: 'basement', name: 'Basement', floor: 'Basement', x: 26, y: 24, w: 48, h: 48, hasBreaker: true, cursedItem: 'Ouija / Circle', lightCount: 2, hidingSpot: true },
    ],
  },
  {
    name: 'Camp Woodwind',
    size: 'Small',
    floors: ['Outdoor Camp'],
    maxLights: 9,
    fuseboxSpawns: [
      { floor: 'Outdoor Camp', location: 'Bathrooms exterior wooden side wall' },
    ],
    cursedSpawns: [
      { item: 'Music Box', location: 'Yellow Sleeping Tent side table' },
      { item: 'Ouija Board', location: 'Games & Activities Tent table' },
      { item: 'Voodoo Doll', location: 'Beside small Red Tent' },
      { item: 'Tarot Cards', location: 'Picnic table near campsite entrance gate' },
      { item: 'Monkey Paw', location: 'Campfire marshmallow bench' },
    ],
    rooms: [
      { id: 'picnic', name: 'Picnic Area', floor: 'Outdoor Camp', x: 14, y: 54, w: 32, h: 34, loopSpot: true, cursedItem: 'Tarot Cards', lightCount: 1 },
      { id: 'campfire', name: 'Campfire', floor: 'Outdoor Camp', x: 48, y: 38, w: 24, h: 28, loopSpot: true, cursedItem: 'Monkey Paw', lightCount: 1 },
      { id: 'tents', name: 'Sleeping Tents & Canopies', floor: 'Outdoor Camp', x: 14, y: 12, w: 42, h: 34, cursedItem: 'Music Box / Voodoo / Ouija', lightCount: 2, hidingSpot: true },
      { id: 'bathroom', name: 'Bathrooms & Generator', floor: 'Outdoor Camp', x: 66, y: 10, w: 24, h: 24, hasBreaker: true, lightCount: 1 },
    ],
  },
  {
    name: 'Grafton Farmhouse',
    size: 'Small',
    floors: ['Ground Floor', 'Upper Floor', 'Attic'],
    maxLights: 9,
    fuseboxSpawns: [
      { floor: 'Ground Floor', location: 'Utility room side wall' },
      { floor: 'Upper Floor', location: 'Upstairs storage closet wall' },
    ],
    cursedSpawns: [
      { item: 'Haunted Mirror', location: 'Foyer front door left wall' },
      { item: 'Music Box', location: 'Foyer shelf beside the staircase' },
      { item: 'Ouija Board', location: 'Master Bedroom walk-in closet' },
      { item: 'Summoning Circle', location: 'Upstairs Storage Room center floor' },
      { item: 'Tarot Cards', location: 'Dining Room farm table' },
      { item: 'Voodoo Doll', location: 'Upstairs Nursery wooden chest' },
      { item: 'Monkey Paw', location: 'Twin Bedroom desk table' },
    ],
    rooms: [
      { id: 'foyer', name: 'Foyer', floor: 'Ground Floor', x: 38, y: 58, w: 24, h: 32, cursedItem: 'Mirror / Music Box', lightCount: 1 },
      { id: 'living', name: 'Living Room', floor: 'Ground Floor', x: 64, y: 48, w: 28, h: 42, lightCount: 2 },
      { id: 'dining', name: 'Dining Room', floor: 'Ground Floor', x: 10, y: 52, w: 26, h: 38, cursedItem: 'Tarot Cards', lightCount: 1 },
      { id: 'kitchen', name: 'Kitchen', floor: 'Ground Floor', x: 10, y: 24, w: 26, h: 26, loopSpot: true, lightCount: 2 },
      { id: 'utility', name: 'Utility Room', floor: 'Ground Floor', x: 64, y: 10, w: 28, h: 34, hasBreaker: true, lightCount: 1 },
      { id: 'master', name: 'Master Bedroom', floor: 'Ground Floor', x: 38, y: 10, w: 24, h: 34, cursedItem: 'Ouija Board', lightCount: 1, hidingSpot: true },
      { id: 'upstairs', name: 'Upstairs Loft, Twin Bed & Nursery', floor: 'Upper Floor', x: 18, y: 18, w: 64, h: 64, hasBreaker: true, cursedItem: 'Voodoo / Paw / Circle', lightCount: 3, hidingSpot: true },
      { id: 'attic', name: 'Attic Storage', floor: 'Attic', x: 24, y: 20, w: 52, h: 52, lightCount: 1, hidingSpot: true },
    ],
  },
  {
    name: 'Bleasdale Farmhouse',
    size: 'Medium',
    floors: ['Ground Floor', 'Upper Floor', 'Attic'],
    maxLights: 10,
    fuseboxSpawns: [
      { floor: 'Ground Floor', location: 'Utility & Workshop rear wall' },
      { floor: 'Attic', location: 'Attic staircase back wall' },
    ],
    cursedSpawns: [
      { item: 'Haunted Mirror', location: 'Ground Floor Office wall' },
      { item: 'Music Box', location: 'Living Room coffee table' },
      { item: 'Ouija Board', location: 'Workshop wooden workbench' },
      { item: 'Summoning Circle', location: 'Attic center floor' },
      { item: 'Tarot Cards', location: 'Office leather desk' },
      { item: 'Voodoo Doll', location: 'Attic armchair' },
      { item: 'Monkey Paw', location: 'Upstairs Master Bedroom antique chest' },
    ],
    rooms: [
      { id: 'foyer', name: 'Foyer', floor: 'Ground Floor', x: 36, y: 58, w: 24, h: 32, lightCount: 1 },
      { id: 'office', name: 'Office', floor: 'Ground Floor', x: 62, y: 58, w: 28, h: 32, cursedItem: 'Mirror / Tarot', lightCount: 1, hidingSpot: true },
      { id: 'living', name: 'Living Room', floor: 'Ground Floor', x: 10, y: 52, w: 24, h: 38, cursedItem: 'Music Box', lightCount: 2 },
      { id: 'kitchen', name: 'Kitchen & Dining', floor: 'Ground Floor', x: 10, y: 14, w: 46, h: 34, loopSpot: true, lightCount: 2 },
      { id: 'utility', name: 'Utility & Workshop', floor: 'Ground Floor', x: 58, y: 14, w: 32, h: 40, hasBreaker: true, cursedItem: 'Ouija Board', lightCount: 1, hidingSpot: true },
      { id: 'up_hall', name: 'Upstairs Hallway & Bathroom', floor: 'Upper Floor', x: 24, y: 38, w: 52, h: 24, lightCount: 2 },
      { id: 'up_beds', name: 'Master, Boys & Girls Bedrooms', floor: 'Upper Floor', x: 14, y: 10, w: 72, h: 26, cursedItem: 'Monkey Paw', lightCount: 3, hidingSpot: true },
      { id: 'attic', name: 'Attic Storage', floor: 'Attic', x: 20, y: 20, w: 60, h: 56, hasBreaker: true, cursedItem: 'Circle / Voodoo', lightCount: 2, hidingSpot: true },
    ],
  },
  {
    name: 'Maple Lodge Campsite',
    size: 'Medium',
    floors: ['Campgrounds', 'Cabin Interiors'],
    maxLights: 10,
    fuseboxSpawns: [
      { floor: 'Campgrounds', location: 'Main Campfire picnic generator post' },
      { floor: 'Cabin Interiors', location: 'Lake Cabin ground floor utility closet' },
    ],
    cursedSpawns: [
      { item: 'Haunted Mirror', location: 'Blue Tent interior floor' },
      { item: 'Music Box', location: 'Reception Cabin porch table' },
      { item: 'Ouija Board', location: 'Cleaning Closet metal shelf' },
      { item: 'Summoning Circle', location: 'Lake Cabin living room floor' },
      { item: 'Tarot Cards', location: 'White Tent picnic table' },
      { item: 'Voodoo Doll', location: 'Campfire logs pile' },
      { item: 'Monkey Paw', location: 'Lake Pier end crate' },
    ],
    rooms: [
      { id: 'reception', name: 'Reception Building', floor: 'Campgrounds', x: 42, y: 66, w: 28, h: 24, cursedItem: 'Music Box', lightCount: 2 },
      { id: 'tents', name: 'Campsite Tents Area', floor: 'Campgrounds', x: 10, y: 38, w: 36, h: 48, cursedItem: 'Mirror / Tarot', lightCount: 2, hidingSpot: true },
      { id: 'campfire', name: 'Main Campfire & Picnic', floor: 'Campgrounds', x: 48, y: 36, w: 38, h: 26, loopSpot: true, cursedItem: 'Voodoo Doll', hasBreaker: true, lightCount: 2 },
      { id: 'pier', name: 'Lake Pier & Shore', floor: 'Campgrounds', x: 24, y: 8, w: 58, h: 24, cursedItem: 'Monkey Paw', lightCount: 1 },
      { id: 'cabin1', name: 'Lake Cabin Floor 1', floor: 'Cabin Interiors', x: 14, y: 46, w: 72, h: 38, hasBreaker: true, cursedItem: 'Summoning Circle', loopSpot: true, lightCount: 3, hidingSpot: true },
      { id: 'cabin2', name: 'Lake Cabin Loft Floor 2', floor: 'Cabin Interiors', x: 14, y: 12, w: 72, h: 30, lightCount: 2, hidingSpot: true },
    ],
  },
  {
    name: 'Prison',
    size: 'Medium',
    floors: ['Ground Floor', 'Upper Level'],
    maxLights: 8,
    fuseboxSpawns: [
      { floor: 'Ground Floor', location: 'Cell Block A upper entrance wall' },
      { floor: 'Ground Floor', location: 'Cell Block B upper entrance wall' },
      { floor: 'Upper Level', location: 'Warden Office utility locker' },
    ],
    cursedSpawns: [
      { item: 'All Cursed Possessions', location: 'Entrance Security Checkpoint plastic bin by the front doors' },
    ],
    rooms: [
      { id: 'entry', name: 'Entrance & Security Checkpoint', floor: 'Ground Floor', x: 34, y: 66, w: 32, h: 24, cursedItem: 'All Cursed Items', lightCount: 2 },
      { id: 'block_a', name: 'Cell Block A', floor: 'Ground Floor', x: 6, y: 26, w: 26, h: 52, hasBreaker: true, lightCount: 2, hidingSpot: true },
      { id: 'block_b', name: 'Cell Block B', floor: 'Ground Floor', x: 68, y: 26, w: 26, h: 52, hasBreaker: true, lightCount: 2, hidingSpot: true },
      { id: 'cafeteria', name: 'Cafeteria & Kitchen', floor: 'Ground Floor', x: 34, y: 8, w: 32, h: 28, loopSpot: true, lightCount: 2 },
      { id: 'central', name: 'Central Control & Visitation', floor: 'Ground Floor', x: 34, y: 38, w: 32, h: 26, lightCount: 2 },
      { id: 'warden', name: 'Warden Office & Infirmary', floor: 'Upper Level', x: 22, y: 22, w: 56, h: 52, hasBreaker: true, lightCount: 3, hidingSpot: true },
    ],
  },
  {
    name: 'Brownstone High School',
    size: 'Large',
    floors: ['Ground Floor', 'Second Floor'],
    maxLights: 8,
    fuseboxSpawns: [
      { floor: 'Ground Floor', location: 'West Classroom hallway utility closet' },
      { floor: 'Ground Floor', location: 'East Classroom science hallway closet' },
      { floor: 'Ground Floor', location: 'Gymnasium rear equipment storage' },
    ],
    cursedSpawns: [
      { item: 'All Cursed Possessions', location: 'Main Foyer Lobby (on/around central bench and pillars inside front doors)' },
    ],
    rooms: [
      { id: 'lobby', name: 'Main Foyer Lobby', floor: 'Ground Floor', x: 36, y: 68, w: 28, h: 22, cursedItem: 'All Cursed Items', lightCount: 2 },
      { id: 'west_wing', name: 'West Wing Classrooms (1–13)', floor: 'Ground Floor', x: 6, y: 14, w: 26, h: 76, hasBreaker: true, lightCount: 4, hidingSpot: true },
      { id: 'east_wing', name: 'East Wing Classrooms & Science Labs', floor: 'Ground Floor', x: 68, y: 14, w: 26, h: 76, hasBreaker: true, lightCount: 4, hidingSpot: true },
      { id: 'gym', name: 'Gymnasium & Cafeteria', floor: 'Ground Floor', x: 36, y: 14, w: 28, h: 48, loopSpot: true, hasBreaker: true, lightCount: 3 },
      { id: 'upstairs', name: 'Second Floor Classrooms & Library', floor: 'Second Floor', x: 10, y: 14, w: 80, h: 72, lightCount: 5, hidingSpot: true },
    ],
  },
  {
    name: 'Sunny Meadows Mental Institution',
    size: 'Large',
    floors: ['Ground Floor', 'Basement'],
    maxLights: 8,
    fuseboxSpawns: [
      { floor: 'Ground Floor', location: 'Entry Foyer administration pillar' },
      { floor: 'Ground Floor', location: 'Chapel entrance arch wall' },
      { floor: 'Basement', location: 'Hospital Wing West utility room' },
      { floor: 'Basement', location: 'Restricted Wing East morgue wall' },
    ],
    cursedSpawns: [
      { item: 'All 7 Cursed Possessions', location: 'Chapel Red Altar Stage (center of Ground Floor)' },
    ],
    rooms: [
      { id: 'foyer', name: 'Entry Foyer & Courtyard', floor: 'Ground Floor', x: 36, y: 58, w: 28, h: 32, hasBreaker: true, lightCount: 2 },
      { id: 'chapel', name: 'Chapel', floor: 'Ground Floor', x: 36, y: 16, w: 28, h: 38, cursedItem: 'All 7 Cursed Items', hasBreaker: true, lightCount: 2 },
      { id: 'male_wing', name: 'Male Wing & Day Room', floor: 'Ground Floor', x: 6, y: 20, w: 28, h: 64, lightCount: 4, hidingSpot: true },
      { id: 'female_wing', name: 'Female Wing & Kitchen', floor: 'Ground Floor', x: 66, y: 20, w: 28, h: 64, lightCount: 4, hidingSpot: true },
      { id: 'base_west', name: 'Basement West (Hospital Wing)', floor: 'Basement', x: 8, y: 22, w: 38, h: 56, hasBreaker: true, lightCount: 3, hidingSpot: true },
      { id: 'base_east', name: 'Basement East (Restricted Wing & Morgue)', floor: 'Basement', x: 54, y: 22, w: 38, h: 56, hasBreaker: true, lightCount: 3, hidingSpot: true },
    ],
  },
  {
    name: 'Sunny Meadows (Restricted)',
    size: 'Medium',
    floors: ['Ground Floor', 'Basement'],
    maxLights: 8,
    fuseboxSpawns: [
      { floor: 'Ground Floor', location: 'Entry Foyer courtyard wall' },
      { floor: 'Basement', location: 'Unlocked Wing utility closet' },
    ],
    cursedSpawns: [
      { item: 'All Cursed Possessions', location: 'Chapel Altar Stage' },
    ],
    rooms: [
      { id: 'foyer', name: 'Entry Foyer & Chapel', floor: 'Ground Floor', x: 28, y: 20, w: 44, h: 64, cursedItem: 'All Cursed Items', hasBreaker: true, lightCount: 3 },
      { id: 'wing', name: 'Unlocked Wing (1 of 5 Randomly Active)', floor: 'Basement', x: 20, y: 24, w: 60, h: 52, hasBreaker: true, lightCount: 3, hidingSpot: true },
    ],
  },
  {
    name: 'Point Hope',
    size: 'Medium',
    floors: ['Lower Levels (1-3)', 'Middle Levels (4-6)', 'Upper Levels (7-10)'],
    maxLights: 10,
    fuseboxSpawns: [
      { floor: 'Lower Levels (1-3)', location: 'Floor 1: Main entrance doorway right wall' },
      { floor: 'Lower Levels (1-3)', location: 'Floor 3: Kitchen rear counter wall' },
      { floor: 'Middle Levels (4-6)', location: 'Floor 4: Games Room side support pillar' },
      { floor: 'Middle Levels (4-6)', location: 'Floor 6: Master Bedroom hallway wall' },
    ],
    cursedSpawns: [
      { item: 'Tarot Cards', location: 'Floor 1: Living Room side table between green armchairs' },
      { item: 'Haunted Mirror', location: 'Floor 3: Dining Room resting on floor against blue cabinet' },
      { item: 'Ouija Board', location: 'Floor 4: Games Room coffee table bottom tier shelf' },
      { item: 'Summoning Circle', location: 'Floor 5: Bathroom center floor tile' },
      { item: 'Music Box', location: 'Floor 6: Master Bedroom vanity dressing table' },
      { item: 'Voodoo Doll', location: 'Floor 7: Child Bedroom chest of drawers by the window' },
      { item: 'Monkey Paw', location: 'Floor 8: Maintenance & Workshop table beside barrels' },
    ],
    rooms: [
      { id: 'floor1', name: 'Floor 1: Entry & Living Room', floor: 'Lower Levels (1-3)', x: 18, y: 12, w: 64, h: 24, cursedItem: 'Tarot Cards', hasBreaker: true, lightCount: 2, loopSpot: true },
      { id: 'floor2', name: 'Floor 2: Bathroom & Hallway', floor: 'Lower Levels (1-3)', x: 18, y: 40, w: 64, h: 24, lightCount: 1 },
      { id: 'floor3', name: 'Floor 3: Dining Room & Kitchen', floor: 'Lower Levels (1-3)', x: 18, y: 68, w: 64, h: 24, cursedItem: 'Haunted Mirror', hasBreaker: true, lightCount: 2 },
      { id: 'floor4', name: 'Floor 4: Games & Recreation Room', floor: 'Middle Levels (4-6)', x: 18, y: 12, w: 64, h: 24, cursedItem: 'Ouija Board', hasBreaker: true, lightCount: 2 },
      { id: 'floor5', name: 'Floor 5: Main Bathroom', floor: 'Middle Levels (4-6)', x: 18, y: 40, w: 64, h: 24, cursedItem: 'Summoning Circle', lightCount: 1 },
      { id: 'floor6', name: 'Floor 6: Master Bedroom & Hallway', floor: 'Middle Levels (4-6)', x: 18, y: 68, w: 64, h: 24, cursedItem: 'Music Box', hasBreaker: true, lightCount: 2, hidingSpot: true },
      { id: 'floor7', name: 'Floor 7: Child Bedroom', floor: 'Upper Levels (7-10)', x: 18, y: 8, w: 64, h: 18, cursedItem: 'Voodoo Doll', lightCount: 1, hidingSpot: true },
      { id: 'floor8', name: 'Floor 8: Maintenance & Workshop', floor: 'Upper Levels (7-10)', x: 18, y: 30, w: 64, h: 18, cursedItem: 'Monkey Paw', lightCount: 1 },
      { id: 'floor9', name: 'Floor 9: Lantern Room (The Light)', floor: 'Upper Levels (7-10)', x: 18, y: 52, w: 64, h: 18, lightCount: 0 },
      { id: 'floor10', name: 'Floor 10: Exterior Balcony / Catwalk', floor: 'Upper Levels (7-10)', x: 14, y: 74, w: 72, h: 20, lightCount: 0 },
    ],
  },
  {
    name: "Nell's Diner",
    size: 'Small',
    floors: ['Ground Floor'],
    maxLights: 9,
    fuseboxSpawns: [
      { floor: 'Ground Floor', location: 'Janitor Storage back left wall beside mop bucket' },
      { floor: 'Ground Floor', location: 'Staff Back Hallway end wall by rear exit door' },
      { floor: 'Ground Floor', location: 'Service Counter right divider wall' },
    ],
    cursedSpawns: [
      { item: 'Tarot Cards', location: 'Front Service Counter beside cash register' },
      { item: 'Voodoo Doll', location: 'Dining Area rear booth bench against left window' },
      { item: 'Monkey Paw', location: 'Kitchen prep wooden cutting block beside knife rack' },
      { item: 'Haunted Mirror', location: 'Break Room chair beside red Mr. Sprinkle machine' },
      { item: 'Summoning Circle', location: "Men's Restroom floor in back hallway" },
      { item: 'Music Box', location: "Manager's Office wooden desk" },
      { item: 'Ouija Board', location: 'Janitor Storage top of cardboard boxes' },
    ],
    rooms: [
      { id: 'foyer', name: 'Front Entrance & Foyer', floor: 'Ground Floor', x: 8, y: 68, w: 22, h: 24, lightCount: 1 },
      { id: 'dining', name: 'Dining Hall & Booths', floor: 'Ground Floor', x: 8, y: 12, w: 38, h: 52, cursedItem: 'Voodoo Doll', loopSpot: true, lightCount: 2 },
      { id: 'counter', name: 'Service Counter', floor: 'Ground Floor', x: 48, y: 46, w: 22, h: 22, cursedItem: 'Tarot Cards', hasBreaker: true, lightCount: 1 },
      { id: 'kitchen', name: 'Commercial Kitchen', floor: 'Ground Floor', x: 50, y: 12, w: 24, h: 30, cursedItem: 'Monkey Paw', loopSpot: true, lightCount: 2 },
      { id: 'cooler', name: 'Walk-in Cooler / Freezer', floor: 'Ground Floor', x: 76, y: 12, w: 18, h: 22, lightCount: 1, hidingSpot: true },
      { id: 'hallway', name: 'Staff Back Hallway', floor: 'Ground Floor', x: 48, y: 70, w: 46, h: 12, hasBreaker: true, lightCount: 1, hidingSpot: true },
      { id: 'break_room', name: 'Employees Break Room', floor: 'Ground Floor', x: 76, y: 38, w: 18, h: 16, cursedItem: 'Haunted Mirror', lightCount: 1, hidingSpot: true },
      { id: 'office', name: "Manager's Office", floor: 'Ground Floor', x: 76, y: 56, w: 18, h: 14, cursedItem: 'Music Box', lightCount: 1, hidingSpot: true },
      { id: 'storage', name: 'Janitor Storage & Closet', floor: 'Ground Floor', x: 72, y: 84, w: 22, h: 13, hasBreaker: true, cursedItem: 'Ouija Board', lightCount: 1, hidingSpot: true },
      { id: 'mens_bath', name: "Men's Restroom", floor: 'Ground Floor', x: 50, y: 84, w: 18, h: 13, cursedItem: 'Summoning Circle', lightCount: 1 },
      { id: 'womens_bath', name: "Women's Restroom", floor: 'Ground Floor', x: 28, y: 84, w: 18, h: 13, lightCount: 1 },
    ],
  },
];
