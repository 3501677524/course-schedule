/** 课程新增 / 编辑页 */
import { useEffect } from 'react';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, PageHeader } from '@/components/Screen';
import { CourseForm } from '@/components/CourseForm';
import { useApp } from '@/hooks/useAppData';
import { useTheme } from '@/components/theme';

export default function CourseEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const app = useApp();
  const { colors } = useTheme();
  const initial = useMemo(() => (id ? app.courses.find((c) => c.id === Number(id)) ?? null : null), [app.courses, id]);

  useEffect(() => {
    console.info(`[course-edit] 页面已挂载（Screen scroll + 返回键），id=${id ?? '新建'}，学期=${app.semester?.name ?? '无'}`);
  }, [id, app.semester]);

  return (
    // scroll=true：CourseForm 的 KeyboardAvoidingView(flex:1)+ScrollView 嵌在零高 body 里会塌陷无法滚动，
    // 由 Screen 统一提供整页滚动；Android 物理返回键走 Stack 默认 pop，头部再给显式返回按钮兜底。
    <Screen>
      <Pressable
        accessibilityRole="button"
        hitSlop={12}
        onPress={() => {
          console.info('[course-edit] 点击返回键，router.back()');
          router.back();
        }}
        style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 12 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '800', marginRight: 2 }}>‹</Text>
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>返回</Text>
        </View>
      </Pressable>
      <View style={{ paddingHorizontal: 16 }}>
        <PageHeader title={initial ? '编辑课程' : '新增课程'} subtitle={initial ? `《${initial.name}》` : '设置周次范围、单双周与对应节次'} />
      </View>
      <CourseForm initial={initial} onDone={() => router.back()} />
    </Screen>
  );
}
