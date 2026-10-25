/** 次级页栈：课程新增/编辑与课程详情。独立于 Tabs，返回键可正确回退到来源 Tab */
import { Stack } from 'expo-router';
import { useTheme } from '@/components/theme';

export default function DetailLayout() {
  const { colors } = useTheme();
  console.info(`[detail-layout] 次级栈容器底色：${colors.bg}`);
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // card：普通推入页。不用 'modal'——Android 上 RN Modal 页面内容在原生层未实现渲染，
        // 打开后整页空白（新增课程界面空白的根因）；也不用 fullScreenModal——固定壳的
        // Android 宿主按「Tabs + Stack」结构预构建，非常规呈现方式没有对应原生容器。
        presentation: 'card',
        animation: 'slide_from_right',
        // 同 Tabs：给原生 Screen 容器上主题底色，避免深色转场滑动时露出默认白面
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="course-edit" options={{ title: '课程编辑' }} />
      <Stack.Screen name="course/[id]" options={{ title: '课程详情' }} />
    </Stack>
  );
}
