// A scenario to open when the 3D city starts: the admin's "test it" link (/play?drive=1&scenario=<id>).
// Its own tiny module so the game screen can set it without pulling the 3D code in.
let pending: string | null = null;

export const queueScenario = (id: string | null) => void (pending = id);
export const peekScenario = () => pending;
export const takeScenario = () => {
  const id = pending;
  pending = null;
  return id;
};
