import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Get git status for prompt display
 * Returns: "main*" or "feature/x" or null if not git repo
 */
export async function getGitStatus() {
  try {
    // Get current branch
    const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      timeout: 1000,
    });
    
    const branchName = branch.trim();
    
    // Check for uncommitted changes
    const { stdout: status } = await execAsync('git status --porcelain', {
      timeout: 1000,
    });
    
    const hasChanges = status.trim().length > 0;
    
    return {
      branch: branchName,
      dirty: hasChanges,
      display: hasChanges ? `${branchName}*` : branchName,
    };
  } catch {
    // Not a git repo or git not available
    return null;
  }
}

/**
 * Get short git status for prompt (cached for 5 seconds)
 */
let cachedGitStatus = null;
let lastGitCheck = 0;

export async function getGitPrompt() {
  const now = Date.now();
  
  // Cache for 5 seconds
  if (cachedGitStatus !== undefined && now - lastGitCheck < 5000) {
    return cachedGitStatus;
  }
  
  const status = await getGitStatus();
  cachedGitStatus = status?.display || null;
  lastGitCheck = now;
  
  return cachedGitStatus;
}

export default { getGitStatus, getGitPrompt };
