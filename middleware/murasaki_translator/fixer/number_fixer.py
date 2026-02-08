"""
数字修复器 (Number Fixer)
功能：恢复圆圈数字 ①②③ 等
"""
import re

class NumberFixer:
    # 圆圈数字列表
    CIRCLED_NUMBERS = tuple(chr(i) for i in range(0x2460, 0x2474))  # ①-⑳
    CIRCLED_NUMBERS_CJK_01 = tuple(chr(i) for i in range(0x3251, 0x3260))  # ㉑-㉟
    CIRCLED_NUMBERS_CJK_02 = tuple(chr(i) for i in range(0x32B1, 0x32C0))  # ㊱-㊿
    # 实心圆圈数字：❶-❿ (0x2776-0x277F), ⓫-⓴ (0x24EB-0x24F4)
    CIRCLED_NUMBERS_SOLID_01 = tuple(chr(i) for i in range(0x2776, 0x2780))
    CIRCLED_NUMBERS_SOLID_02 = tuple(chr(i) for i in range(0x24EB, 0x24F5))
    
    CIRCLED_NUMBERS_ALL = ("",) + CIRCLED_NUMBERS + CIRCLED_NUMBERS_CJK_01 + CIRCLED_NUMBERS_CJK_02 + \
                          CIRCLED_NUMBERS_SOLID_01 + CIRCLED_NUMBERS_SOLID_02

    # 正则表达式
    PATTERN_ALL_NUM = re.compile(r"\d+|[①-⑳㉑-㉟㊱-㊿❶-❿⓫-⓴]", re.IGNORECASE)
    PATTERN_CIRCLED_NUM = re.compile(r"[①-⑳㉑-㉟㊱-㊿❶-❿⓫-⓴]", re.IGNORECASE)

    @classmethod
    def fix(cls, src: str, dst: str) -> str:
        """修复圆圈数字"""
        src_nums = cls.PATTERN_ALL_NUM.findall(src)
        dst_nums = cls.PATTERN_ALL_NUM.findall(dst)
        src_circled_nums = cls.PATTERN_CIRCLED_NUM.findall(src)

        # 如果原文中没有圆圈数字，跳过
        if not src_circled_nums:
            return dst

        # 容错增强：模型有时会重复输出。
        # 如果原文数字少于译文，且前段匹配，我们依然尝试修复前部。
        # 典型的失败案例：原文 ① 译文 1 1 (重写成了两个 1)
        # 我们采用“贪心对齐”策略，只要原文数字在当前位置是圆圈，就尝试同步。
        
        limit = min(len(src_nums), len(dst_nums))
        for i in range(limit):
            src_num_str = src_nums[i]
            dst_num_str = dst_nums[i]
            
            # 只有原文是圆圈数字时才处理
            if not cls.PATTERN_CIRCLED_NUM.match(src_num_str):
                continue
                
            dst_num_int = cls.safe_int(dst_num_str)
            
            # 检查译文是否是阿拉伯数字且数值匹配
            # 注：这里做了一个简化，如果原文位置是圆圈，译文对应位置是阿拉伯数字，就直接还原
            if dst_num_int > 0:
                # 修复该位置
                dst = cls.fix_by_index(dst, i, src_num_str)

        return dst

    @classmethod
    def safe_int(cls, s: str) -> int:
        """安全转换为整数"""
        try:
            return int(s)
        except:
            return -1

    @classmethod
    def fix_by_index(cls, dst: str, target_i: int, target_str: str) -> str:
        """通过索引修复"""
        i = [0]

        def repl(m: re.Match) -> str:
            if i[0] == target_i:
                i[0] += 1
                return target_str
            else:
                i[0] += 1
                return m.group(0)

        return cls.PATTERN_ALL_NUM.sub(repl, dst)
