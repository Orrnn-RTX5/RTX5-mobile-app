import datetime
import json
import pathlib
import plistlib
import zipfile

root = pathlib.Path(__file__).resolve().parent
phone = json.loads((root / 'registered-connected-iphone.json').read_text(encoding='utf-8'))
with zipfile.ZipFile(root / 'expo-go54-connected-iphone.ipa') as archive:
    main = next(name for name in archive.namelist() if name.startswith('Payload/') and name.count('/') == 2 and name.endswith('.app/Info.plist'))
    app_path = main.removesuffix('Info.plist')
    info = plistlib.loads(archive.read(main))
    profiles = []
    for name in archive.namelist():
        if name.startswith(app_path) and name.endswith('/embedded.mobileprovision'):
            cms = archive.read(name)
            start, end = cms.find(b'<?xml'), cms.find(b'</plist>')
            if start < 0 or end < 0:
                raise RuntimeError('Provisioning profile cannot be decoded')
            profile = plistlib.loads(cms[start:end + len(b'</plist>')])
            identifiers = [value.replace('-', '').upper() for value in profile.get('ProvisionedDevices', [])]
            included = phone['identifier'].replace('-', '').upper() in identifiers
            if not included:
                raise RuntimeError('The connected iPhone is missing from the provisioning profile')
            if profile['ExpirationDate'] <= datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None):
                raise RuntimeError('The provisioning profile has expired')
            if profile.get('TeamIdentifier') != ['FGVWUQA882']:
                raise RuntimeError('Unexpected signing team')
            profiles.append({'name': profile['Name'], 'deviceIncluded': True, 'deviceCount': len(identifiers),
                             'expiration': profile['ExpirationDate'].isoformat(),
                             'applicationIdentifier': profile['Entitlements']['application-identifier']})
    if len(profiles) < 2:
        raise RuntimeError('Main app and notification extension profiles are required')
    if info.get('CFBundleIdentifier') != 'com.yoforex.expogo':
        raise RuntimeError('Unexpected app identifier')
    if not info.get('CFBundleShortVersionString', '').startswith('54.'):
        raise RuntimeError('Expected Expo Go version 54')
    result = {'bundleIdentifier': info['CFBundleIdentifier'],
              'name': info.get('CFBundleDisplayName', info.get('CFBundleName')),
              'version': info['CFBundleShortVersionString'], 'build': info.get('CFBundleVersion'),
              'profiles': profiles, 'installedOnPhone': False}
    (root / 'device-ipa-verification.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))
