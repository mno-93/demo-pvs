import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// Warten auf Oberflächenzustände: großzügiger als die voreingestellte Sekunde, weil die Tests
// parallel laufen und CI-Rechner langsamer sind — sonst schlagen sie unter Last zufällig fehl.
configure({ asyncUtilTimeout: 5000 });

// Nach jedem Oberflächentest den Baum abräumen, damit Tests einander nicht sehen.
afterEach(() => {
  cleanup();
});
