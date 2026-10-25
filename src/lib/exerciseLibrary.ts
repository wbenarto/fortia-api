// Shared vocabulary for the workout builder: the equipment, focus and style keys the
// app sends, plus how free-exercise-db rows map onto them (used by the seed script).

export const EQUIPMENT_KEYS = [
  'dumbbells',
  'barbell',
  'bench',
  'cable',
  'machines',
  'pull_up_bar',
  'kettlebell',
  'bands',
  'ez_bar',
  'smith_machine',
  'medicine_ball',
  'cardio_machine',
  'foam_roll',
] as const;
export type EquipmentKey = (typeof EQUIPMENT_KEYS)[number];

export const FOCUS_KEYS = [
  'full_body',
  'upper',
  'lower',
  'push',
  'pull',
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'glutes',
  'core',
] as const;
export type FocusKey = (typeof FOCUS_KEYS)[number];

export const STYLE_KEYS = [
  'strength',
  'muscle',
  'hiit',
  'cardio',
  'mobility',
] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];

export const LOCATION_KEYS = ['gym', 'home', 'anywhere'] as const;
export type LocationKey = (typeof LOCATION_KEYS)[number];

export const DURATIONS = [15, 30, 45, 60, 90] as const;

const UPPER_MUSCLES = new Set([
  'chest',
  'shoulders',
  'triceps',
  'biceps',
  'forearms',
  'lats',
  'middle back',
  'traps',
]);
const LOWER_MUSCLES = new Set([
  'quadriceps',
  'hamstrings',
  'calves',
  'adductors',
  'abductors',
  'glutes',
]);

export const MUSCLE_FOCUS: Record<string, FocusKey[]> = {
  chest: ['chest'],
  shoulders: ['shoulders'],
  triceps: ['arms'],
  biceps: ['arms'],
  forearms: ['arms'],
  lats: ['back'],
  'middle back': ['back'],
  traps: ['back'],
  'lower back': ['back', 'core'],
  abdominals: ['core'],
  quadriceps: ['legs'],
  hamstrings: ['legs'],
  calves: ['legs'],
  adductors: ['legs'],
  abductors: ['legs', 'glutes'],
  glutes: ['glutes', 'legs'],
};

export interface SourceExercise {
  id: string;
  name: string;
  force: string | null;
  level: string | null;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}

const CARDIO_MACHINE =
  /treadmill|elliptical|recumbent|stationary|stairmaster|step mill/i;
const PULL_UP_BAR = /pull-?up|chin-?up|\bchins?\b|muscle up|hanging/i;
const NEEDS_BENCH = /bench|incline|decline|seated/i;

// Required equipment for a source row. Returns null when it needs something we
// don't offer (sleds, atlas stones, boxes, ropes…) so the row is skipped.
export function mapEquipment(ex: SourceExercise): EquipmentKey[] | null {
  const name = ex.name;
  if (CARDIO_MACHINE.test(name)) return ['cardio_machine'];

  switch (ex.equipment) {
    case null:
    case 'body only':
      if (PULL_UP_BAR.test(name)) return ['pull_up_bar'];
      if (/^dips/i.test(name)) return ['machines']; // dip station
      if (/inverted row/i.test(name)) return ['barbell']; // bar set low in a rack
      if (/bench/i.test(name)) return ['bench'];
      return [];
    case 'dumbbell':
      return NEEDS_BENCH.test(name) ? ['dumbbells', 'bench'] : ['dumbbells'];
    case 'barbell':
      return NEEDS_BENCH.test(name) ? ['barbell', 'bench'] : ['barbell'];
    case 'e-z curl bar':
      return NEEDS_BENCH.test(name) ? ['ez_bar', 'bench'] : ['ez_bar'];
    case 'cable':
      return ['cable'];
    case 'machine':
      return /smith/i.test(name) ? ['smith_machine'] : ['machines'];
    case 'kettlebells':
      return ['kettlebell'];
    case 'bands':
      return ['bands'];
    case 'medicine ball':
      return ['medicine_ball'];
    case 'foam roll':
      return ['foam_roll'];
    case 'other':
      if (PULL_UP_BAR.test(name)) return ['pull_up_bar'];
      if (/-SMR$/i.test(name)) return ['foam_roll'];
      // Floor/wall stretches filed under "other" need nothing
      if (ex.category === 'stretching' && !/chair|bar|band|rope/i.test(name))
        return [];
      return null;
    default:
      return null;
  }
}

export function mapFocusTags(ex: SourceExercise): FocusKey[] {
  const tags = new Set<FocusKey>();
  const muscles = ex.primaryMuscles;
  for (const muscle of muscles) {
    for (const tag of MUSCLE_FOCUS[muscle] || []) tags.add(tag);
  }
  const upper = muscles.some(m => UPPER_MUSCLES.has(m));
  const lower = muscles.some(m => LOWER_MUSCLES.has(m));
  if (upper) tags.add('upper');
  if (lower) tags.add('lower');
  if (upper && ex.force === 'push') tags.add('push');
  if (upper && ex.force === 'pull') tags.add('pull');
  // Compound moves that hit both halves (or the whole chain) count as full body
  if ((upper && lower) || ex.secondaryMuscles.length >= 3)
    tags.add('full_body');
  return [...tags];
}

// Categories we never put in generated workouts (technique-heavy or needs specialist kit)
export const EXCLUDED_CATEGORIES = new Set([
  'olympic weightlifting',
  'strongman',
]);

export const IMAGE_BASE_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
