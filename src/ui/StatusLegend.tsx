import { useSpaceStore } from '../store';
import styles from './StatusLegend.module.css';

const ITEMS = [
  { label: 'Error', color: '#ff4444', rings: true },
  { label: 'Needs you', color: '#ffaa44', rings: true },
  { label: 'Working', color: '#44ffaa', rings: false },
  { label: 'Done', color: '#6688aa', rings: false },
];

export function StatusLegend() {
  const sidebarOpen = useSpaceStore((s) => s.sidebarOpen);
  return (
    <aside
      className={sidebarOpen ? `${styles.legend} ${styles.shifted}` : styles.legend}
      aria-label="Status legend"
    >
      <ul className={styles.list}>
        {ITEMS.map((item) => (
          <li key={item.label}>
            <span className={styles.swatch} style={{ background: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
      <p className={styles.note}>Rings pulse on error and needs you. Done planets are dimmer.</p>
    </aside>
  );
}
