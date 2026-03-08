import { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjects } from "../hooks/useProjects";
import type { CliType, Project, RecentDirectory } from "../types";

interface ProjectsViewProps {
  onOpenSession: (cwd: string, cliType: CliType) => void;
}

function formatTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function dirName(path: string): string {
  const parts = path.replace(/\/$/, "").split("/");
  return parts[parts.length - 1] || path;
}

function ProjectCard({
  project,
  onOpen,
  onRemove,
}: {
  project: Project;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="project-card">
      <div className="project-card-header">
        <span className="project-card-name">{project.name}</span>
        <span className="project-card-cli tag">
          {project.cliType === "claude-code" ? "Claude Code" : "Codex"}
        </span>
      </div>
      <div className="project-card-path">{project.path}</div>
      <div className="project-card-footer">
        <span className="project-card-time">{formatTime(project.lastOpenedAt)}</span>
        <div className="project-card-actions">
          <button className="btn btn-sm btn-primary" onClick={onOpen}>
            Open Session
          </button>
          <button className="btn btn-sm btn-ghost" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function RecentDirRow({
  dir,
  onRegister,
}: {
  dir: RecentDirectory;
  onRegister: () => void;
}) {
  return (
    <div className="recent-dir-row">
      <div className="recent-dir-info">
        <span className="recent-dir-path">{dir.path}</span>
        <span className="recent-dir-time">{formatTime(dir.lastUsedAt)}</span>
      </div>
      <button className="btn btn-sm" onClick={onRegister}>
        Register
      </button>
    </div>
  );
}

export function ProjectsView({ onOpenSession }: ProjectsViewProps) {
  const { projects, recentDirs, loading, registerProject, unregisterProject } =
    useProjects();
  const [registering, setRegistering] = useState<string | null>(null);
  const [regName, setRegName] = useState("");
  const [regCli, setRegCli] = useState<CliType>("claude-code");

  const handleRegisterNew = useCallback(async () => {
    const selected = await open({ directory: true });
    if (typeof selected !== "string") return;

    const name = dirName(selected);
    await registerProject(name, selected, "claude-code");
  }, [registerProject]);

  const handleStartRegister = useCallback((path: string) => {
    setRegistering(path);
    setRegName(dirName(path));
    setRegCli("claude-code");
  }, []);

  const handleConfirmRegister = useCallback(async () => {
    if (!registering || !regName) return;
    await registerProject(regName, registering, regCli);
    setRegistering(null);
  }, [registering, regName, regCli, registerProject]);

  const handleCancelRegister = useCallback(() => {
    setRegistering(null);
  }, []);

  if (loading) {
    return (
      <div className="projects-view">
        <div className="projects-loading">Loading projects...</div>
      </div>
    );
  }

  return (
    <div className="projects-view">
      <div className="projects-header">
        <h2 className="projects-title">Projects</h2>
        <button className="btn btn-primary" onClick={handleRegisterNew}>
          Add Project
        </button>
      </div>

      <div className="projects-section">
        <h3 className="projects-section-title">Registered Projects</h3>
        {projects.length === 0 ? (
          <div className="projects-empty">
            No projects registered. Add a project to get started.
          </div>
        ) : (
          <div className="projects-grid">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={() => onOpenSession(project.path, project.cliType)}
                onRemove={() => void unregisterProject(project.id)}
              />
            ))}
          </div>
        )}
      </div>

      {recentDirs.length > 0 && (
        <div className="projects-section">
          <h3 className="projects-section-title">Recent Directories</h3>
          <div className="recent-dirs-list">
            {recentDirs.map((dir) => (
              <div key={dir.path}>
                {registering === dir.path ? (
                  <div className="register-form">
                    <input
                      className="form-value"
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Project name"
                      style={{ cursor: "text", flex: 1 }}
                    />
                    <select
                      className="form-select"
                      value={regCli}
                      onChange={(e) => setRegCli(e.target.value as CliType)}
                    >
                      <option value="claude-code">Claude Code</option>
                      <option value="codex" disabled>Codex</option>
                    </select>
                    <button className="btn btn-sm btn-primary" onClick={handleConfirmRegister}>
                      Confirm
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={handleCancelRegister}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <RecentDirRow
                    dir={dir}
                    onRegister={() => handleStartRegister(dir.path)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
