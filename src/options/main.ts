import { createApp } from 'vue';
import App from './App.vue';
// 复用侧栏的样式与主题（Tailwind + shadcn-vue 变量）
import '../sidebar/styles.css';
import { setupUI } from '@/sidebar/plugins/ui';

const app = createApp(App);
setupUI(app);
app.mount('#app');

