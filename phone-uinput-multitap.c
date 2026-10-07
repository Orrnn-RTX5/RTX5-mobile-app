// Minimal /dev/uinput multi-tap injector for the MIUI test phone. The single
// tap helper pays the ~400ms device-registration settle PER invocation, so two
// invocations can never produce a real double-tap. This one creates the
// virtual device once and emits N taps with a controllable gap.
// Usage: phone-uinput-multitap <x> <y> [count] [gap_ms]
#include <fcntl.h>
#include <linux/uinput.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static void emit(int fd, int type, int code, int value) {
  struct input_event ev;
  memset(&ev, 0, sizeof(ev));
  ev.type = type;
  ev.code = code;
  ev.value = value;
  write(fd, &ev, sizeof(ev));
}

int main(int argc, char **argv) {
  int x = 540, y = 1170, count = 2, gap = 160;
  if (argc >= 3) {
    x = atoi(argv[1]);
    y = atoi(argv[2]);
  }
  if (argc >= 4) count = atoi(argv[3]);
  if (argc >= 5) gap = atoi(argv[4]);
  if (count < 1) count = 1;

  int fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
  if (fd < 0) {
    perror("open /dev/uinput");
    return 1;
  }

  ioctl(fd, UI_SET_EVBIT, EV_KEY);
  ioctl(fd, UI_SET_KEYBIT, BTN_TOUCH);
  ioctl(fd, UI_SET_EVBIT, EV_ABS);
  ioctl(fd, UI_SET_ABSBIT, ABS_X);
  ioctl(fd, UI_SET_ABSBIT, ABS_Y);
  ioctl(fd, UI_SET_ABSBIT, ABS_MT_POSITION_X);
  ioctl(fd, UI_SET_ABSBIT, ABS_MT_POSITION_Y);
  ioctl(fd, UI_SET_ABSBIT, ABS_MT_TRACKING_ID);
  ioctl(fd, UI_SET_ABSBIT, ABS_MT_SLOT);
  ioctl(fd, UI_SET_EVBIT, EV_SYN);
  ioctl(fd, UI_SET_PROPBIT, INPUT_PROP_DIRECT);

  struct uinput_user_dev ud;
  memset(&ud, 0, sizeof(ud));
  snprintf(ud.name, sizeof(ud.name), "claude-virt-multitap");
  ud.id.bustype = BUS_VIRTUAL;
  ud.absmin[ABS_X] = 0; ud.absmax[ABS_X] = 1079;
  ud.absmin[ABS_Y] = 0; ud.absmax[ABS_Y] = 2339;
  ud.absmin[ABS_MT_POSITION_X] = 0; ud.absmax[ABS_MT_POSITION_X] = 1079;
  ud.absmin[ABS_MT_POSITION_Y] = 0; ud.absmax[ABS_MT_POSITION_Y] = 2339;
  ud.absmin[ABS_MT_TRACKING_ID] = 0; ud.absmax[ABS_MT_TRACKING_ID] = 65535;
  ud.absmin[ABS_MT_SLOT] = 0; ud.absmax[ABS_MT_SLOT] = 9;
  write(fd, &ud, sizeof(ud));
  if (ioctl(fd, UI_DEV_CREATE) < 0) {
    perror("UI_DEV_CREATE");
    return 1;
  }

  // Give the input pipeline time to enumerate the new device.
  usleep(400000);

  for (int i = 0; i < count; i++) {
    emit(fd, EV_ABS, ABS_MT_SLOT, 0);
    emit(fd, EV_ABS, ABS_MT_TRACKING_ID, i + 1);
    emit(fd, EV_KEY, BTN_TOUCH, 1);
    emit(fd, EV_ABS, ABS_MT_POSITION_X, x);
    emit(fd, EV_ABS, ABS_MT_POSITION_Y, y);
    emit(fd, EV_ABS, ABS_X, x);
    emit(fd, EV_ABS, ABS_Y, y);
    emit(fd, EV_SYN, SYN_REPORT, 0);

    usleep(55000);

    emit(fd, EV_ABS, ABS_MT_TRACKING_ID, -1);
    emit(fd, EV_KEY, BTN_TOUCH, 0);
    emit(fd, EV_SYN, SYN_REPORT, 0);

    if (i + 1 < count) usleep(1000L * gap);
  }

  usleep(150000);
  ioctl(fd, UI_DEV_DESTROY);
  close(fd);
  printf("temporary virtual multitap emitted %dx at %d,%d gap %dms\n", count, x, y, gap);
  return 0;
}
