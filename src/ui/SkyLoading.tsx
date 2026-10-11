import { LOADING_SKY } from './skyCopy';
import styles from './SkyLoading.module.css';

export function SkyLoading() {
  return (
    <div className={styles.sky} role="status">
      <div className={styles.stars} aria-hidden="true" />
      <p className={styles.label}>{LOADING_SKY}</p>
    </div>
  );
}
