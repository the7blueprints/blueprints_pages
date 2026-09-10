import unittest
from linux_setup_agent import diagnose


class LinuxSetupTests(unittest.TestCase):
    def test_unknown_is_not_success(self):
        self.assertEqual(diagnose('an unfamiliar failure', True), [])

    def test_non_debian_never_gets_apt_venv_advice(self):
        advice = ' '.join(diagnose('ensurepip is not available', False))
        self.assertNotIn('sudo apt', advice)
        self.assertIn('exact Python version', advice)

    def test_debian_gets_venv_package(self):
        self.assertIn('python3-venv', ' '.join(diagnose('No module named venv', True)))

    def test_managed_python_uses_venv(self):
        self.assertIn('source venv/bin/activate', ' '.join(diagnose('externally-managed-environment', True)))

    def test_missing_activation_checks_directory(self):
        self.assertIn('pwd', ' '.join(diagnose('venv/bin/activate: No such file or directory', True)))

    def test_permission_is_not_blanket_sudo(self):
        self.assertIn('does not establish why', ' '.join(diagnose('Permission denied', True)))

    def test_lock_is_not_deleted(self):
        self.assertIn('Do not delete lock files', ' '.join(diagnose('Could not get lock', True)))


if __name__ == '__main__':
    unittest.main()
