import styles from './ProjectPanel.module.css';

export function HumanLingoToggle({
  humanLingo,
  onToggle,
}: {
  humanLingo: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={styles.toggle} onClick={onToggle}>
      <div
        className={`${styles.highlight} ${humanLingo ? styles.highlightHuman : styles.highlightRaw}`}
      />
      <span className={`${styles.option} ${humanLingo ? styles.optionOff : styles.optionOn}`}>
        Raw
      </span>
      <span className={`${styles.option} ${humanLingo ? styles.optionOn : styles.optionOff}`}>
        Human Lingo
      </span>
    </div>
  );
}
