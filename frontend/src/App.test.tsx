import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const formValues = {
  brand_name: "Custom Reserve",
  class_type: "Cognac",
  abv: "40%",
  net_contents: "700 mL",
  producer: "Maison Example",
  country_of_origin: "France",
  government_warning: "CUSTOM WARNING: Serve chilled.",
};

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the label image and all seven application fields for single-label verification", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        overall_verdict: "APPROVED",
        latency_ms: 12,
        results: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.upload(
      screen.getByLabelText(/choose label image/i),
      new File(["image-bytes"], "label.png", { type: "image/png" }),
    );
    await user.type(screen.getByLabelText(/brand name/i), formValues.brand_name);
    await user.type(screen.getByLabelText(/type of alcohol/i), formValues.class_type);
    await user.type(screen.getByLabelText(/alcohol by volume/i), formValues.abv);
    await user.type(screen.getByLabelText(/net contents/i), formValues.net_contents);
    await user.type(screen.getByLabelText(/producer/i), formValues.producer);
    await user.type(screen.getByLabelText(/country of origin/i), formValues.country_of_origin);
    await user.type(screen.getByLabelText(/government warning/i), formValues.government_warning);

    await user.click(screen.getByRole("button", { name: /check label/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/verify",
      expect.objectContaining({ method: "POST" }),
    );

    const body = fetchMock.mock.calls[0][1].body as FormData;
    const image = body.get("image") as File;
    expect(image).toBeInstanceOf(File);
    expect(image.name).toBe("label.png");
    expect(JSON.parse(body.get("application_data") as string)).toEqual(formValues);
  });
});
