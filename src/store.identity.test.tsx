// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SpaceData } from './types';
import { useSpaceStore } from './store';
import { testProject } from './test/fixtures';

const data: SpaceData = {
  lastUpdated: 10,
  projects: [
    testProject('keep', [{ id: 'keep-agent', status: 'working' }]),
    testProject('other', [{ id: 'other-agent', status: 'working' }]),
    { id: 'empty', name: 'empty', path: '/tmp/empty', fileCount: 0, agents: [] },
  ],
};

function cloneData(source: SpaceData): SpaceData {
  return structuredClone(source);
}

describe('snapshot identity', () => {
  beforeEach(() => {
    useSpaceStore.setState({
      projects: [],
      lastUpdated: 0,
      connection: 'connecting',
      dataStale: false,
      snapshotSeen: false,
      pendingEmpty: false,
      holdPreviousUntil: 0,
      scanStartedAt: null,
      selectedPlanetId: null,
    });
  });

  it('does not re-render subscribers when the next snapshot is unchanged', () => {
    let selectedRenders = 0;
    let listRenders = 0;

    function Selected() {
      const project = useSpaceStore((state) => state.projects.find((item) => item.id === 'keep'));
      selectedRenders += 1;
      return <span>{project?.agents[0]?.status}</span>;
    }

    function List() {
      const projects = useSpaceStore((state) => state.projects);
      listRenders += 1;
      return <span>{projects.length}</span>;
    }

    render(
      <>
        <Selected />
        <List />
      </>,
    );
    const mountedSelected = selectedRenders;
    const mountedList = listRenders;

    act(() => {
      useSpaceStore.getState().setData(data);
    });
    expect(selectedRenders).toBe(mountedSelected + 1);
    expect(listRenders).toBe(mountedList + 1);
    const projects = useSpaceStore.getState().projects;
    expect(projects.map((project) => project.id)).toEqual(['keep', 'other']);

    act(() => {
      useSpaceStore.getState().setData(cloneData(data));
    });
    expect(selectedRenders).toBe(mountedSelected + 1);
    expect(listRenders).toBe(mountedList + 1);
    expect(useSpaceStore.getState().projects).toBe(projects);
    expect(useSpaceStore.getState().projects[0]).toBe(projects[0]);
    expect(useSpaceStore.getState().projects[0].agents[0]).toBe(projects[0].agents[0]);
  });

  it('keeps an untouched project stable when another project changes', () => {
    let selectedRenders = 0;
    let listRenders = 0;

    function Selected() {
      const project = useSpaceStore((state) => state.projects.find((item) => item.id === 'keep'));
      selectedRenders += 1;
      return <span>{project?.name}</span>;
    }

    function List() {
      const projects = useSpaceStore((state) => state.projects);
      listRenders += 1;
      return <span>{projects.length}</span>;
    }

    render(
      <>
        <Selected />
        <List />
      </>,
    );
    act(() => {
      useSpaceStore.getState().setData(data);
    });
    const keep = useSpaceStore.getState().projects[0];
    const afterFirstSelected = selectedRenders;
    const afterFirstList = listRenders;

    const changed = cloneData(data);
    changed.lastUpdated = 11;
    changed.projects[1].agents[0].status = 'error';
    act(() => {
      useSpaceStore.getState().setData(changed);
    });

    expect(useSpaceStore.getState().projects[0]).toBe(keep);
    expect(useSpaceStore.getState().projects[1].agents[0].status).toBe('error');
    expect(selectedRenders).toBe(afterFirstSelected);
    expect(listRenders).toBe(afterFirstList + 1);
    expect(useSpaceStore.getState().lastUpdated).toBe(11);
  });

  it('replaces one agent without copying its unchanged siblings', () => {
    act(() => {
      useSpaceStore.getState().setData({
        lastUpdated: 1,
        projects: [
          testProject('keep', [
            { id: 'same', status: 'working' },
            { id: 'edit', status: 'working' },
          ]),
        ],
      });
    });
    const agents = useSpaceStore.getState().projects[0].agents;
    const changed: SpaceData = {
      lastUpdated: 2,
      projects: structuredClone(useSpaceStore.getState().projects),
    };
    changed.projects[0].agents[1].errorReason = 'boom';
    act(() => {
      useSpaceStore.getState().setData(changed);
    });
    const next = useSpaceStore.getState().projects[0].agents;
    expect(next[0]).toBe(agents[0]);
    expect(next[1]).not.toBe(agents[1]);
    expect(next[1].errorReason).toBe('boom');
  });
});
