import { day } from '../lib/workspaceStatus';

/** C3 (Brad, 26 Oct 2026): an item entered to exercise the system, not as case evidence — marked, never deleted. */
export interface SystemExerciseMark { reason: string; marked_by: string; marked_on: string }

/** The one sentence every surface shows for a marked item: who marked it, when, and its reason (which quotes the item's own note). */
export function SystemExerciseLine({ mark, testid = 'system-exercise', className = '' }: { mark: SystemExerciseMark; testid?: string; className?: string }) {
  return (
    <p className={'m-0 text-[11.5px] text-warning [overflow-wrap:anywhere] ' + className} data-testid={testid}>
      <span className="font-semibold">SYSTEM EXERCISE</span> — marked by {mark.marked_by}, {day(mark.marked_on)}. {mark.reason}
    </p>
  );
}
