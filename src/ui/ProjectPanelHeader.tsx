import { prettifyName } from '../prettifyName';
import styles from './ProjectPanel.module.css';

export function ProjectPanelHeader({
  name,
  path,
  summary,
  onClose,
}: {
  name: string;
  path: string;
  summary: string;
  onClose: () => void;
}) {
  return (
    <div className={styles.header}>
      <div className={styles.titles}>
        <h2 className={styles.name}>
          {prettifyName(name)}
          <span className={styles.srOnly}>{`. ${summary}`}</span>
        </h2>
        <div className={styles.path}>{path}</div>
      </div>
      <button
        type="button"
        className={styles.esc}
        aria-label="Close project details"
        onClick={onClose}
      >
        ESC
      </button>
    </div>
  );
}
