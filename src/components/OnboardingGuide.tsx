/** 首次启动操作指南：逐条介绍四个一级页面的能力（只展示一次） */
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from './theme';

const ITEMS: { icon: string; title: string; desc: string }[] = [
  {
    icon: '☀️',
    title: '今日',
    desc: '今天有哪些课、下一节课还有多久、剩余课程时间轴，一眼看清当天安排。',
  },
  {
    icon: '🗓️',
    title: '本周',
    desc: '整周课表网格，左右切换周次；点任意课程可查看教室、教师、上课周次。',
  },
  {
    icon: '📊',
    title: '今日预览',
    desc: '剩余课程环形图、学期已过/剩余进度、节假日倒计时、作业与考试提醒、学分总览。',
  },
  {
    icon: '⚙️',
    title: '我的',
    desc: '课程 / 作息 / 学期 / 校历管理，上课与考试提醒，数据备份与 Excel 课表导入导出，班级课表云同步。',
  },
];

export function OnboardingGuide() {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.lead, { color: colors.textSecondary }]}>
        课程表是一款纯离线的课程管理工具，数据只保存在本机。下面四个页面是它的全部入口：
      </Text>
      {ITEMS.map((it) => (
        <View key={it.title} style={[styles.item, { backgroundColor: colors.cardSoft, borderColor: colors.border }]}>
          <Text style={styles.icon}>{it.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.itemTitle, { color: colors.text }]}>{it.title}</Text>
            <Text style={[styles.itemDesc, { color: colors.textSecondary }]}>{it.desc}</Text>
          </View>
        </View>
      ))}
      <Text style={[styles.tip, { color: colors.textMuted }]}>
        小提示：在「我的 → 数据备份与迁移」里可以下载 Excel 课表模板，把模板交给 AI 让它按格式写好课表，再用「导入周课表」一键导入。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  lead: { fontSize: 13.5, lineHeight: 22, marginBottom: 4 },
  item: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, alignItems: 'flex-start' },
  icon: { fontSize: 22, lineHeight: 26 },
  itemTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  itemDesc: { fontSize: 13, lineHeight: 21 },
  tip: { fontSize: 12, lineHeight: 19, marginTop: 6 },
});