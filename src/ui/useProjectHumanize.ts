import { useEffect, useRef } from 'react';
import { requestHumanize } from '../hooks/useSocket';
import { useSpaceStore } from '../store';
import type { ProjectInfo } from '../types';

export function useProjectHumanize(project: ProjectInfo | undefined, humanLingo: boolean): void {
  const setHumanizedTexts = useSpaceStore((s) => s.setHumanizedTexts);
  const humanizedTexts = useSpaceStore((s) => s.humanizedTexts);
  const lastHumanizeRef = useRef('');

  useEffect(() => {
    if (!project || !humanLingo) return;

    const rawTexts = project.agents
      .flatMap((agent) => [agent.lastAction, agent.errorReason])
      .filter((text): text is string => Boolean(text))
      .filter((text) => !humanizedTexts[text])
      .filter((text, index, arr) => arr.indexOf(text) === index);

    if (rawTexts.length === 0) return;

    const key = rawTexts.sort().join('|');
    if (key === lastHumanizeRef.current) return;
    lastHumanizeRef.current = key;

    requestHumanize(rawTexts).then((result) => {
      if (Object.keys(result.texts).length > 0) setHumanizedTexts(result.texts);
    });
  }, [project, humanLingo, humanizedTexts, setHumanizedTexts]);
}
