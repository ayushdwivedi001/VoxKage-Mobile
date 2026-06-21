# hud_parser.py — HUD stream token parser for real-time thinking log extraction.
# Intercepts [HUD: ...] markers from the LLM completion stream and routes them
# to the mobile UI thinking bubble instead of the chat text.
# Also filters out DSML XML tool calls to prevent leaking into the chat UI.

import re

class DsmlStreamFilter:
    def __init__(self):
        self.buffer = ""
        self.discarding = False
        self.discarding_type = None

    def feed(self, chunk: str) -> str:
        self.buffer += chunk
        output = []
        
        while True:
            if not self.discarding:
                # Search for start tag: <||DSML||tool_calls or <||DSML||invoke
                match = re.search(r'<[｜|?]{2}DSML[｜|?]{2}(tool_calls|invoke)', self.buffer)
                if match:
                    start_idx = match.start()
                    tag_type = match.group(1)
                    if start_idx > 0:
                        output.append(self.buffer[:start_idx])
                    self.buffer = self.buffer[start_idx:]
                    self.discarding = True
                    self.discarding_type = tag_type
                else:
                    # Check for partial start tag at the end
                    last_lt = self.buffer.rfind('<')
                    if last_lt != -1 and (len(self.buffer) - last_lt) <= 30:
                        suffix = self.buffer[last_lt:]
                        normalized_suffix = suffix.replace('｜', '|').replace('?', '|')
                        if "|DSML".startswith(normalized_suffix[1:]) or "|DSML|tool_calls".startswith(normalized_suffix[1:]) or "|DSML|invoke".startswith(normalized_suffix[1:]):
                            emit_len = last_lt
                            if emit_len > 0:
                                output.append(self.buffer[:emit_len])
                                self.buffer = self.buffer[emit_len:]
                            break
                    output.append(self.buffer)
                    self.buffer = ""
                    break
            else:
                pattern = rf'</[｜|?]{2}DSML[｜|?]{2}{self.discarding_type}>'
                match = re.search(pattern, self.buffer)
                if match:
                    end_idx = match.end()
                    self.buffer = self.buffer[end_idx:]
                    self.discarding = False
                    self.discarding_type = None
                else:
                    last_c = self.buffer.rfind('</')
                    if last_c != -1 and (len(self.buffer) - last_c) <= 30:
                        self.buffer = self.buffer[last_c:]
                    else:
                        self.buffer = ""
                    break
        return "".join(output)

    def flush(self) -> str:
        res = ""
        if not self.discarding:
            res = self.buffer
        self.buffer = ""
        return res


class HudStreamParser:
    def __init__(self):
        self.dsml_filter = DsmlStreamFilter()
        self.buffer = ""
        self.hud_active = False
        self.hud_content = ""

    def feed(self, chunk: str) -> list:
        # First filter out DSML tool call tags/content from the chunk
        filtered_chunk = self.dsml_filter.feed(chunk)
        if not filtered_chunk:
            return []
            
        self.buffer += filtered_chunk
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
        # Flush the DSML filter first
        last_dsml_chunk = self.dsml_filter.flush()
        if last_dsml_chunk:
            self.buffer += last_dsml_chunk
            
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
