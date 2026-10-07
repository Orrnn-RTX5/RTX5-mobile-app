import assert from 'node:assert/strict';
import test from 'node:test';
import * as features from './nativeFeaturesUnavailable';

test('legacy OTA can load without any optional native capabilities', async () => {
  assert.equal(await features.Accelerometer.isAvailableAsync(), false);
  const subscription = features.Accelerometer.addListener(() => assert.fail('Absent sensor emitted a sample'));
  subscription.remove();
  for (const operation of [features.getDocumentAsync(), features.launchImageLibraryAsync(), features.setStringAsync('report-id')]) {
    await assert.rejects(operation, /newer installed app/);
  }
  assert.throws(() => new features.File('file://attachment'), /newer installed app/);
  assert.throws(() => features.ImageManipulator.manipulate('file://attachment'), /newer installed app/);
});
