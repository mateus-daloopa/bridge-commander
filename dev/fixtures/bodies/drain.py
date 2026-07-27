"""Queue drain — fixture source file, here so the dev board has a CODE artifact
to open in the editor (the markdown one exercises the other preview path)."""
import asyncio
from dataclasses import dataclass

MAX_ATTEMPTS = 5
BACKOFF = [0.5, 1, 2, 4, 8]  # seconds, per attempt


@dataclass
class Item:
    id: str
    target: str
    body: str
    attempts: int = 0


class Drain:
    """Pulls items off the queue and delivers them, one target at a time."""

    def __init__(self, queue, deliver):
        self.queue = queue
        self.deliver = deliver
        self._stopped = False

    async def run(self) -> None:
        while not self._stopped:
            item = await self.queue.get()
            if item is None:  # poison pill: shutdown
                break
            await self._attempt(item)

    async def _attempt(self, item: Item) -> bool:
        while item.attempts < MAX_ATTEMPTS:
            try:
                await self.deliver(item.target, item.body)
                return True
            except TimeoutError:
                await asyncio.sleep(BACKOFF[item.attempts])
                item.attempts += 1
        print(f"giving up on {item.id} after {item.attempts} attempts")
        return False

    def stop(self):
        self._stopped = True
