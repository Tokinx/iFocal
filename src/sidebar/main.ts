import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import { setupUI } from './plugins/ui';

const app = createApp(App);
setupUI(app);
app.mount('#app');
