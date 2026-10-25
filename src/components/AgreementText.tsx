/** 《用户须知与免责声明》全文：首次启动强制同意页与「关于软件」查看页共用同一份内容 */
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from './theme';

/** 协议章节：标题 + 段落列表 */
const SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: '一、协议确认与接受',
    paragraphs: [
      '1.1 本文件是你和本软件开发者之间，关于安装、使用、折腾本软件的君子约定。只要你安装了、复制了、对着源码改了两行，甚至只是下载下来瞅了一眼，就默认你已经读完、看懂、并且全盘接受这里的所有条款。别事后说没看见，没看见你还点进来？',
      '1.2 要是你不同意这里的任何一句话，麻烦立刻停止安装、卸载干净、把源码也删了，就当我们从没见过，彼此体面。',
    ],
  },
  {
    title: '二、软件使用规范',
    paragraphs: [
      '2.1 先提前说清楚：这软件 99% 的时间都是纯离线运行，你干啥违规内容大概率也传不出去，但该走的流程还是得走一遍。请你遵纪守法、讲点公德，别拿这软件干任何违法缺德的事，包括但不限于：',
      '· 搞危害国家安全、传播违法信息的勾当；',
      '· 发淫秽色情、暴力辱骂、坑害他人的内容；',
      '· 拿去破解别人系统、偷别人数据；',
      '· 改吧改就换个皮拿去卖钱、或者冒充官方版本到处坑人。',
      '2.2 既然是开源软件，你随便改、随便拆、随便研究源码，不用搞什么反向工程 —— 源码都明明白白摆你脸上了。但改完出了任何问题、惹了任何麻烦，全是你自己的事，别来找原版开发者背锅。',
      '2.3 软件跑起来占你点 CPU、内存、硬盘空间都是正常操作，由此产生的电费、设备损耗、网费（虽然基本用不上网），全由你自己承担，别找开发者报销，开发者也没钱。',
    ],
  },
  {
    title: '三、软件功能与更新说明',
    paragraphs: [
      '3.1 本软件按「现状」原封不动交付，主打一个随缘维护。开发者对外会说“尽力保障稳定”，这话是骗你的。能用是情分，出 bug 是本分，撞上没 bug 的版本算你今天运气好，遇到崩溃闪退也请平常心对待，不许哭。',
      '3.2 开发者保留随时升级、砍功能、改逻辑，或者直接鸽掉不再更新的全部权利。会不会更新、什么时候更、更什么内容，全看当天有没有空、心情好不好、有没有突然冒出的灵感。真有重大变更，尽量想起来通知大家，忘了也很正常。',
      '3.3 因为系统版本不一样、硬件配置奇奇怪怪、和你电脑里别的软件打架等原因导致用不了、部分功能失效的，都属于正常技术风险，开发者不背这个锅，也没义务挨个给你适配。',
    ],
  },
  {
    title: '四、数据与隐私说明',
    paragraphs: [
      '4.1 本软件严格恪守离线本分，连联网的代码都懒得写，绝对不会主动收集、上传你的任何个人信息。你硬盘里的文件、浏览记录、私人数据，我们半毛钱都碰不到，也完全没兴趣知道。以后要是真的需要加什么权限、收什么数据，肯定会明明白白告诉你，征得你同意再说。',
      '4.2 你用这软件产生的所有本地文件、配置数据，都请你自己做好备份。不管是设备坏了、手滑删了、软件崩了导致数据没了，开发者都不负责找回，也赔不起。重要数据多存几个地方，准没错。',
    ],
  },
];

export function AgreementText() {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.lead, { color: colors.textSecondary }]}>
        使用本软件前，请完整阅读以下条款。勾选同意即表示你已阅读并接受全部内容。
      </Text>
      {SECTIONS.map((sec) => (
        <View key={sec.title} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{sec.title}</Text>
          {sec.paragraphs.map((p, i) => (
            <Text key={i} style={[styles.paragraph, { color: colors.textSecondary }]}>
              {p}
            </Text>
          ))}
        </View>
      ))}
      <Text style={[styles.footer, { color: colors.textMuted }]}>最后更新：2026 年 10 月</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  lead: { fontSize: 13, lineHeight: 21, marginBottom: 10 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  paragraph: { fontSize: 13.5, lineHeight: 23, marginBottom: 8 },
  footer: { fontSize: 11.5, marginTop: 4 },
});