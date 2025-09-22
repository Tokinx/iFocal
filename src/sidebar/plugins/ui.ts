import type { App } from 'vue';
import { Icon } from '@iconify/vue';

import { Button } from '@/sidebar/components/ui/button';
import { Textarea } from '@/sidebar/components/ui/textarea';
import { Input } from '@/sidebar/components/ui/input';
import { Label } from '@/sidebar/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectItemText
} from '@/sidebar/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/sidebar/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuShortcut,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem
} from '@/sidebar/components/ui/dropdown-menu';
import { ScrollArea, ScrollBar } from '@/sidebar/components/ui/scroll-area';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose, DialogHeader, DialogFooter, DialogScrollContent } from '@/sidebar/components/ui/dialog';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from '@/sidebar/components/ui/command';

export function setupUI(app: App) {
  // Iconify global icon component
  app.component('Icon', Icon);

  app.component('Button', Button);
  app.component('Textarea', Textarea);
  app.component('Input', Input);
  app.component('Label', Label);

  app.component('Select', Select);
  app.component('SelectTrigger', SelectTrigger);
  app.component('SelectContent', SelectContent);
  app.component('SelectValue', SelectValue);
  app.component('SelectItem', SelectItem);
  app.component('SelectGroup', SelectGroup);
  app.component('SelectLabel', SelectLabel);
  app.component('SelectSeparator', SelectSeparator);
  app.component('SelectScrollDownButton', SelectScrollDownButton);
  app.component('SelectScrollUpButton', SelectScrollUpButton);
  app.component('SelectItemText', SelectItemText);

  app.component('Popover', Popover);
  app.component('PopoverTrigger', PopoverTrigger);
  app.component('PopoverContent', PopoverContent);

  app.component('DropdownMenu', DropdownMenu);
  app.component('DropdownMenuTrigger', DropdownMenuTrigger);
  app.component('DropdownMenuContent', DropdownMenuContent);
  app.component('DropdownMenuItem', DropdownMenuItem);
  app.component('DropdownMenuGroup', DropdownMenuGroup);
  app.component('DropdownMenuLabel', DropdownMenuLabel);
  app.component('DropdownMenuSeparator', DropdownMenuSeparator);
  app.component('DropdownMenuSub', DropdownMenuSub);
  app.component('DropdownMenuSubTrigger', DropdownMenuSubTrigger);
  app.component('DropdownMenuSubContent', DropdownMenuSubContent);
  app.component('DropdownMenuShortcut', DropdownMenuShortcut);
  app.component('DropdownMenuCheckboxItem', DropdownMenuCheckboxItem);
  app.component('DropdownMenuRadioGroup', DropdownMenuRadioGroup);
  app.component('DropdownMenuRadioItem', DropdownMenuRadioItem);

  app.component('ScrollArea', ScrollArea);
  app.component('ScrollBar', ScrollBar);

  app.component('Command', Command);
  app.component('CommandDialog', CommandDialog);
  app.component('CommandEmpty', CommandEmpty);
  app.component('CommandGroup', CommandGroup);
  app.component('CommandInput', CommandInput);
  app.component('CommandItem', CommandItem);
  app.component('CommandList', CommandList);
  app.component('CommandSeparator', CommandSeparator);
  app.component('CommandShortcut', CommandShortcut);

  // Dialog components
  app.component('Dialog', Dialog);
  app.component('DialogTrigger', DialogTrigger);
  app.component('DialogContent', DialogContent);
  app.component('DialogTitle', DialogTitle);
  app.component('DialogDescription', DialogDescription);
  app.component('DialogClose', DialogClose);
  app.component('DialogHeader', DialogHeader);
  app.component('DialogFooter', DialogFooter);
  app.component('DialogScrollContent', DialogScrollContent);
}
