import { useLocalSearchParams } from 'expo-router';
import { LegalDocumentScreen, type LegalDocumentKind } from '../../src/features/settings/LegalDocumentScreen';

export default function LegalDocumentRoute() {
  const { document } = useLocalSearchParams<{ document?: string }>();
  const documentKind: LegalDocumentKind = document === 'terms' ? 'terms' : 'privacy';

  return <LegalDocumentScreen document={documentKind} />;
}
