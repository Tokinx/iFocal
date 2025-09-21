import type { App } from 'vue';
import UiButton from '@/sidebar/components/ui/button.vue';
import UiTextarea from '@/sidebar/components/ui/textarea.vue';
import UiSelect from '@/sidebar/components/ui/select.vue';

export function setupUI(app: App) {
  app.component('UiButton', UiButton);
  app.component('UiTextarea', UiTextarea);
  app.component('UiSelect', UiSelect);
}
