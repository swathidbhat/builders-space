import styles from './ProjectPanel.module.css';

export function HumanLingoToggle({
  humanLingo,
  onToggle,
}: {
  humanLingo: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={styles.toggle} role="group" aria-label="Activity wording">
      <div
        className={`${styles.highlight} ${humanLingo ? styles.highlightHuman : styles.highlightRaw}`}
        aria-hidden="true"
      />
      <button
        type="button"
        className={`${styles.option} ${humanLingo ? styles.optionOff : styles.optionOn}`}
        aria-pressed={!humanLingo}
        onClick={() => {
          if (humanLingo) onToggle();
        }}
      >
        Raw
      </button>
      <button
        type="button"
        className={`${styles.option} ${humanLingo ? styles.optionOn : styles.optionOff}`}
        aria-pressed={humanLingo}
        onClick={() => {
          if (!humanLingo) onToggle();
        }}
      >
        Human Lingo
      </button>
    </div>
  );
}
