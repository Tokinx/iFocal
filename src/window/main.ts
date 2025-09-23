import { createApp } from 'vue';
import App from './App.vue';
// Reuse sidebar theme/styles so UI is consistent
import '@/sidebar/styles.css';
import { setupUI } from '@/sidebar/plugins/ui';

const app = createApp(App);
setupUI(app);
app.mount('#app');

