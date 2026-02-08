"""
假名修复器 (Kana Fixer)
功能：移除孤立的拟声词假名（当翻译残留时清理）
"""


class KanaFixer:
    # 残留日语助词与拟声词
    # 增加的助词往往会在翻译末尾残留，如“这是翻译的 の”
    KANA_TO_CLEAN = frozenset({
        "ッ", "っ",  # 促音
        "ぁ", "ぃ", "ぅ", "ぇ", "ぉ",  # 小写平假名
        "ゃ", "ゅ", "ょ", "ゎ",
        "の", "は", "に", "を", "た", "て", "で" # 常见末尾残留助词
    })
    
    # 平假名/片假名/汉字 范围
    HIRAGANA_START = 0x3040
    HIRAGANA_END = 0x309F
    KATAKANA_START = 0x30A0
    KATAKANA_END = 0x30FF
    CJK_START = 0x4E00
    CJK_END = 0x9FFF

    @classmethod
    def is_japanese_char(cls, char: str) -> bool:
        """判断字符是否为日语语境相关字符（假名或汉字）"""
        if not char:
            return False
        code = ord(char)
        return (cls.HIRAGANA_START <= code <= cls.HIRAGANA_END or 
                cls.KATAKANA_START <= code <= cls.KATAKANA_END or
                cls.CJK_START <= code <= cls.CJK_END)

    @classmethod
    def fix(cls, dst: str) -> str:
        """
        移除孤立的日语残留字符
        主要针对翻译后遗留在句尾或标点前的单个假名
        """
        if not dst:
            return dst
        
        # 预先检查是否存在需要清理的假名
        if not any(c in cls.KANA_TO_CLEAN for c in dst):
            return dst

        result = []
        length = len(dst)

        for i, char in enumerate(dst):
            if char in cls.KANA_TO_CLEAN:
                # 检查前后语境
                prev_char = dst[i - 1] if i > 0 else None
                next_char = dst[i + 1] if i < length - 1 else None

                # 判定条件：
                # 1. 前面是非日语中文字符（如空格、中文标点或结尾）
                # 2. 后面是中文标点或结尾
                
                is_prev_japanese = prev_char is not None and cls.is_japanese_char(prev_char)
                is_next_japanese = next_char is not None and cls.is_japanese_char(next_char)

                # 增加包裹符号保护逻辑 (Quotes/Brackets protection)
                # 如果假名被引号、括号、书名号等包裹，通常代表它是特意提及的内容
                PROTECTION_PAIRS = {
                    '“': '”', '‘': '’', '「': '」', '『': '』', '（': '）', 
                    '(': ')', '《': '》', '〈': '〉', '【': '】', '［': '］', '[': ']'
                }
                is_protected = False
                if prev_char in PROTECTION_PAIRS and next_char == PROTECTION_PAIRS[prev_char]:
                    is_protected = True
                elif prev_char in ['"', "'", "`"] and next_char == prev_char:
                    is_protected = True

                # 判定逻辑优化
                if is_prev_japanese or is_next_japanese or is_protected:
                    # 如果夹在日语语境中，或是被符号包裹，保留
                    result.append(char)
                else:
                    # 孤立点（如“测试 的 の” 或 “测试 の。”）
                    # 如果后方是典型的结束标点，则该假名为残留，跳过
                    is_at_end = next_char is None or next_char in "。！？，；：”」』）〉》】］]… "
                    if is_at_end:
                         continue # 移除
                    else:
                         result.append(char)
            else:
                result.append(char)

        return "".join(result)
