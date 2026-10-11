import { useSpaceStore } from '../store';
import { STATUS_MARK } from './statusCue';
import { useCompactLayout } from './useCompactLayout';
import styles from './StatusLegend.module.css';

const ITEMS = [
  { label: 'Error', key: 'error', color: '#ff4444', rings: true },
  { label: 'Needs you', key: 'waiting', color: '#ffaa44', rings: true },
  { label: 'Working', key: 'working', color: '#44ffaa', rings: false },
  { label: 'Done', key: 'done', color: '#6688aa', rings: false },
] as const;

export function StatusLegend() {
  const sidebarOpen = useSpaceStore((s) => s.sidebarOpen);
  const compact = useCompactLayout();
  const shifted = sidebarOpen && !compact;
  return (
    <aside
      className={shifted ? `${styles.legend} ${styles.shifted}` : styles.legend}
      aria-label="Status legend"
    >
      <ul className={styles.list}>
        {ITEMS.map((item) => (
          <li key={item.label}>
            <span className={styles.mark} aria-hidden="true">
              {STATUS_MARK[item.key]}
            </span>
            <span className={styles.swatch} style={{ background: item.color }} aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
      <p className={styles.note}>Rings pulse on error and needs you. Done planets are dimmer.</p>
    </aside>
  );
}
