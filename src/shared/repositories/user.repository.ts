import mongoose from "mongoose";
import { User, IUserDocument, AssignableRole } from "../models/user.model";

class UserRepository {
  async findById(id: string): Promise<IUserDocument | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return User.findById(id);
  }

  async findByEmail(email: string): Promise<IUserDocument | null> {
    return User.findOne({ email: email.toLowerCase() });
  }

  async findByEmailWithPassword(email: string): Promise<IUserDocument | null> {
    return User.findOne({ email: email.toLowerCase() }).select("+password");
  }

  async findByGoogleId(googleId: string): Promise<IUserDocument | null> {
    return User.findOne({ googleId });
  }

  async create(data: Partial<IUserDocument>): Promise<IUserDocument> {
    return User.create(data);
  }

  async updateRoles(
    userId: string,
    roles: AssignableRole[],
  ): Promise<IUserDocument | null> {
    return User.findByIdAndUpdate(userId, { $set: { roles } }, { new: true });
  }

  async findAll(
    page = 1,
    limit = 20,
  ): Promise<{ users: IUserDocument[]; total: number }> {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find({}).skip(skip).limit(limit).select("-password"),
      User.countDocuments(),
    ]);
    return { users, total };
  }

  async promoteToAdmin(email: string): Promise<IUserDocument | null> {
    return User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: { role: "admin" } },
      { new: true },
    );
  }
}

export const userRepository = new UserRepository();
