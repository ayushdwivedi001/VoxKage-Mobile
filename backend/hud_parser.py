# hud_parser.py — HUD stream token parser for real-time thinking log extraction.
# Intercepts [HUD: ...] markers from the LLM completion stream and routes them
# to the mobile UI thinking bubble instead of the chat text.


class HudStreamParser:
    def __init__(self):
        self.buffer = ""
        self.hud_active = False
        self.hud_content = ""

    def feed(self, chunk: str) -> list:
        self.buffer += chunk
        output = []
        
        while True:
            if not self.hud_active:
                start_idx = self.buffer.find("[HUD:")
                if start_idx == -1:
                    possible_start = False
                    for i in range(len("[HUD:")):
                        suffix = "[HUD:"[:i+1]
                        if self.buffer.endswith(suffix):
                            possible_start = True
                            emit_len = len(self.buffer) - len(suffix)
                            if emit_len > 0:
                                output.append({"type": "token", "content": self.buffer[:emit_len]})
                                self.buffer = self.buffer[emit_len:]
                            break
                    if not possible_start:
                        if self.buffer:
                            output.append({"type": "token", "content": self.buffer})
                            self.buffer = ""
                    break
                else:
                    if start_idx > 0:
                        output.append({"type": "token", "content": self.buffer[:start_idx]})
                    self.buffer = self.buffer[start_idx + len("[HUD:"):]
                    self.hud_active = True
                    self.hud_content = ""
            else:
                end_idx = self.buffer.find("]")
                if end_idx == -1:
                    self.hud_content += self.buffer
                    self.buffer = ""
                    break
                else:
                    self.hud_content += self.buffer[:end_idx]
                    self.buffer = self.buffer[end_idx + 1:]
                    self.hud_active = False
                    output.append({"type": "hud_log", "content": self.hud_content.strip()})
                    self.hud_content = ""
        return output

    def flush(self) -> list:
        output = []
        if self.hud_active:
            output.append({"type": "token", "content": f"[HUD:{self.hud_content}{self.buffer}"})
        else:
            if self.buffer:
                output.append({"type": "token", "content": self.buffer})
        self.buffer = ""
        self.hud_active = False
        self.hud_content = ""
        return output
