import { expect, type Page } from '@playwright/test';

export class DashboardPage {
  constructor(readonly page: Page) {}

  async gotoProjects(): Promise<void> {
    await this.page.goto('/projects');
    await expect(this.page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  }

  async openProject(name = 'Harbor House'): Promise<void> {
    await this.page.getByRole('link', { name, exact: true }).click();
    await expect(this.page.getByRole('heading', { level: 1, name })).toBeVisible();
  }

  async openPrimarySection(name: string): Promise<void> {
    await this.page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name })
      .click();
  }

  async openReport(number: number): Promise<void> {
    await this.page
      .getByRole('button', {
        name: new RegExp(`^Open Site Visit #${number}:`),
      })
      .click();
    await expect(this.page.getByText(`Site Visit #${number}`)).toBeVisible();
  }
}
