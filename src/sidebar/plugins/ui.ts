import type { App } from 'vue';
import Button from '@/sidebar/components/ui/button.vue';
import Textarea from '@/sidebar/components/ui/textarea.vue';
import Select from '@/sidebar/components/ui/select/Select.vue';
import SelectTrigger from '@/sidebar/components/ui/select/SelectTrigger.vue';
import SelectContent from '@/sidebar/components/ui/select/SelectContent.vue';
import SelectValue from '@/sidebar/components/ui/select/SelectValue.vue';
import SelectItem from '@/sidebar/components/ui/select/SelectItem.vue';
import SelectGroup from '@/sidebar/components/ui/select/SelectGroup.vue';
import SelectLabel from '@/sidebar/components/ui/select/SelectLabel.vue';
import SelectSeparator from '@/sidebar/components/ui/select/SelectSeparator.vue';

export function setupUI(app: App) {
  app.component('Button', Button);
  app.component('Textarea', Textarea);
  app.component('Select', Select);
  app.component('SelectTrigger', SelectTrigger);
  app.component('SelectContent', SelectContent);
  app.component('SelectValue', SelectValue);
  app.component('SelectItem', SelectItem);
  app.component('SelectGroup', SelectGroup);
  app.component('SelectLabel', SelectLabel);
  app.component('SelectSeparator', SelectSeparator);
}
