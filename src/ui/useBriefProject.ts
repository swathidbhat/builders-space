import { useEffect, useMemo, useRef } from 'react';
import { useSpaceStore } from '../store';
import { requestBriefing } from '../hooks/useSocket';
import { selectSurfaceAgents } from '../scene/surfacePlacement';
import { briefingInput, briefingRequestKey } from './briefingRequest';
import type { ProjectInfo } from '../types';

/** Long enough for a roster to settle, short enough not to feel like a stall. */
const DEBOUNCE_MS = 400;

/**
 * How many times to re-ask for a roster that came back with nothing.
 *
 * An empty answer is the only failure shape there is now, and it covers both
 * the transient (a socket still reconnecting, a dropped ack, a call that
 * errored) and the permanent (no API key). The client cannot tell them apart,
 * so it retries a few times and then stops — enough to ride out a reconnect,
 * bounded so a keyless server is not asked forever.
 */
const EMPTY_RETRIES = 3;

/**
 * Keeps the party briefing current for the project you are standing on.
 *
 * Headless. Everything the landed view says about an agent — its goal, its
 * party, its own contribution — comes from here, so this running is the
 * difference between a camp with labels and a camp of silent figures.
 *
 * Briefs the surface roster rather than every agent on the project. That caps
 * the request at five for free, and guarantees no party can name an agent that
 * has no body standing on the ground.
 */
export function useBriefProject(project: ProjectInfo | undefined): void {
  const setBriefing = useSpaceStore((s) => s.setBriefing);
  const selectedId = useSpaceStore((s) => s.selectedPlanetId);
  const lastRequested = useRef('');
  const emptiesFor = useRef({ key: '', count: 0 });

  const agents = project?.agents;
  const input = useMemo(
    () => (agents ? briefingInput(selectSurfaceAgents(agents)) : []),
    [agents],
  );

  useEffect(() => {
    if (!project || input.length === 0) return;

    // Guard on content, not array identity: the socket hands us a fresh agents
    // array every tick, and the roster inside it is usually unchanged.
    const key = briefingRequestKey(input);
    if (key === lastRequested.current) return;

    // The key alone does not settle an agent flapping in and out of the roster
    // on a TTL boundary — that toggles the key back and forth, and every toggle
    // is a miss. Let it come to rest first.
    const timer = setTimeout(() => {
      lastRequested.current = key;
      const projectId = project.id;

      requestBriefing(input).then((result) => {
        // Nothing came back. Clear the guard so a later tick tries again —
        // without this, one lost response would wedge the project for as long
        // as the roster held still, since the key it is stuck on never changes.
        // Bounded, or a keyless server would be asked on every tick forever.
        if (result.parties.length === 0) {
          const seen = emptiesFor.current;
          const count = seen.key === key ? seen.count + 1 : 1;
          emptiesFor.current = { key, count };
          if (count < EMPTY_RETRIES) lastRequested.current = '';
          return;
        }
        // Flew away mid-flight.
        if (useSpaceStore.getState().selectedPlanetId !== projectId) return;

        setBriefing({ projectId, key, parties: result.parties });
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [project, input, selectedId, setBriefing]);
}
